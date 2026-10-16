import { ClienteModel } from '../models/Postgres/clients.js';
import { ClientPendingOrdersModel } from '../models/Postgres/clientPendingOrders.js';
import { UserModel } from '../models/Postgres/usuarios.js';
import { validateCliente, validatePartialCliente } from '../schemas/clients.js';
import { normalizeUserClientAccess, ensureClientAccess } from '../utils/clientPortfolioAccess.js';

const COMMERCIAL_ROLE = 'comercial';

const normalizeRepresentativeCodes = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .replace(/[{}\"]/g, '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
};

const getCommercialDisplayName = (user) => {
    const fullName = [user?.nombre, user?.apellido1, user?.apellido2]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ');

    return fullName || String(user?.username || '').trim() || 'Comercial asignado';
};

const buildCommercialByRepresentative = (users = []) => {
    const map = new Map();

    users.forEach((user) => {
        const codes = [
            String(user?.codrepre || '').trim(),
            ...normalizeRepresentativeCodes(user?.codrepres),
        ].filter(Boolean);

        codes.forEach((code) => {
            if (!map.has(code)) map.set(code, getCommercialDisplayName(user));
        });
    });

    return map;
};

export class ClienteController {
    async getPendingOrders(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 10000);
            const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 20);
            const result = await ClientPendingOrdersModel.getByClient({ codclien, page, limit });
            res.setHeader('Cache-Control', 'no-store');
            res.json(result);
        } catch (error) {
            console.error('[clientes/pedidos-pendientes]', error);
            if (error.code === 'PENDING_ORDERS_UNAVAILABLE') {
                return res.status(503).json({ code: error.code, message: error.message });
            }
            return res.status(500).json({ message: 'No se han podido consultar los pedidos pendientes.' });
        }
    }

    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, codpais, codprovi, query, status } = req.query;
            const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 100);
            const offset = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * safeLimit;
            const { codclien, codrepres } = normalizeUserClientAccess(req.user);

            const clientes = await ClienteModel.getAll({
                offset,
                limit: safeLimit,
                codpais,
                codprovi,
                query,
                status,
                codclien,
                codrepres,
            });

            const totalClientes = await ClienteModel.getCount({
                codpais,
                codprovi,
                query,
                status,
                codclien,
                codrepres,
            });

            res.json({ clients: clientes, total: totalClientes });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async checkExisting(req, res) {
        try {
            const query = String(req.query.query || '').trim();
            const localidad = String(req.query.localidad || '').trim();
            const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 12);

            const normalizedQuery = query
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]/g, '');

            if (normalizedQuery.length < 3) {
                return res.status(400).json({
                    error: 'SEARCH_TOO_SHORT',
                    message: 'Escribe al menos 3 caracteres para comprobar el cliente.',
                });
            }

            const rows = await ClienteModel.checkExisting({ query, localidad, limit });
            const access = normalizeUserClientAccess(req.user);
            const ownClientCodes = new Set(normalizeRepresentativeCodes(access.codclien));
            const ownRepresentativeCodes = new Set(normalizeRepresentativeCodes(access.codrepres));
            const isCommercial = String(req.user?.role || '').trim().toLowerCase() === COMMERCIAL_ROLE;

            const commercialUsers = await UserModel.getCommercialUsers();
            const commercialByRepresentative = buildCommercialByRepresentative(commercialUsers);

            const matches = rows.map((client) => {
                const representativeCode = String(client.codrepre || '').trim();
                const isOwnClient = ownClientCodes.has(String(client.codclien || '').trim())
                    || (representativeCode && ownRepresentativeCodes.has(representativeCode));

                let ownership = 'UNASSIGNED';
                if (representativeCode) {
                    ownership = isCommercial && isOwnClient ? 'OWN' : (isCommercial ? 'OTHER' : 'ASSIGNED');
                } else if (isOwnClient) {
                    ownership = 'OWN';
                }

                return {
                    razclien: client.razclien || 'Cliente sin razón social',
                    localidad: client.localidad || '',
                    codpais: client.codpais || '',
                    ownership,
                    commercialName: representativeCode
                        ? (commercialByRepresentative.get(representativeCode) || 'Otro comercial')
                        : null,
                    openClientCode: ownership === 'OWN' ? client.codclien : null,
                };
            });

            return res.status(200).json({ matches });
        } catch (error) {
            console.error('Error checking client ownership:', error);
            return res.status(500).json({
                error: 'CLIENT_OWNERSHIP_CHECK_FAILED',
                message: 'No se ha podido comprobar el cliente.',
            });
        }
    }

    async getBillingHistory(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const history = await ClienteModel.getBillingHistory(codclien);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const cliente = await ClienteModel.getById({ codclien });

            if (cliente) {
                res.json(cliente);
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        try {
            const { query = '', limit = 10 } = req.query;
            const { codclien, codrepres } = normalizeUserClientAccess(req.user);

            const results = await ClienteModel.search({
                query,
                limit: Number(limit),
                codclien,
                codrepres,
            });

            res.status(200).json(results);
        } catch (error) {
            console.error('Error searching clients:', error);
            res.status(500).json({ error: 'Error searching clients' });
        }
    }

    async getByCodclien(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const cliente = await ClienteModel.getByCodclien({ codclien });

            if (cliente) {
                res.json(cliente);
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            console.error('Error en getByCodclien:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async create(req, res) {
        try {
            const validationResult = validateCliente(req.body);

            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }

            const data = validationResult.data;
            const access = normalizeUserClientAccess(req.user);
            if (access.codclien || (access.codrepres && !access.codrepres.includes(String(data.codrepre || '').trim()))) {
                return res.status(403).json({ message: 'No puedes dar de alta clientes fuera de tu cartera.' });
            }
            const newCliente = await ClienteModel.create({ input: data });
            res.status(201).json(newCliente);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { codclien } = req.params;
            if (!await ensureClientAccess(req, res, codclien)) return;
            const validationResult = validatePartialCliente(req.body);

            if (!validationResult.success) {
                return res.status(400).json({ error: validationResult.error.errors });
            }

            const data = validationResult.data;
            if (!Object.keys(data).length) {
                return res.status(400).json({ message: 'No se han proporcionado campos editables.' });
            }
            if ('codclien' in data) {
                return res.status(400).json({ message: 'No se permite modificar el código del cliente.' });
            }
            const canReassign = ['admin', 'administracion'].includes(String(req.user?.role || '').toLowerCase());
            if ('codrepre' in data && !canReassign) {
                return res.status(403).json({ message: 'Solo administración puede cambiar el representante del cliente.' });
            }
            const updatedCliente = await ClienteModel.update({ codclien, input: data, allowRepresentativeChange: canReassign });

            if (updatedCliente) {
                res.json(updatedCliente);
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { codclien } = req.params;
            if (!['admin', 'administracion'].includes(String(req.user?.role || '').toLowerCase())) {
                return res.status(403).json({ message: 'Solo administración puede eliminar clientes.' });
            }
            if (!await ensureClientAccess(req, res, codclien)) return;
            const result = await ClienteModel.delete({ codclien });

            if (result) {
                res.json({ message: 'Client deleted' });
            } else {
                res.status(404).json({ message: 'Client not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getByProvince(req, res) {
        try {
            const { codprovi } = req.params;
            const { codclien, codrepres } = normalizeUserClientAccess(req.user);
            const clients = await ClienteModel.getByProvince({ codprovi, codclien, codrepres });
            res.json(clients);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getClientsWithBilling(req, res) {
        try {
            const { page = 1, limit = 10, order = 'DESC', codpais, codprovi, query, status } = req.query;
            const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 100);
            const offset = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * safeLimit;
            const { codclien, codrepres } = normalizeUserClientAccess(req.user);

            const filters = { codpais, codprovi, query, status, codclien, codrepres };
            const [clients, total] = await Promise.all([
                ClienteModel.getClientsWithBilling({ ...filters, limit: safeLimit, offset, order }),
                ClienteModel.getCount(filters),
            ]);

            res.json({ clients, total });
        } catch (error) {
            console.error('Error fetching clients with billing:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    async getResumenPorPais(req, res) {
        try {
            const ejercicio = req.query.anio || '2025';
            const resumen = await ClienteModel.getResumenPorPais(ejercicio);
            res.json(resumen);
        } catch (error) {
            console.error('Error en ClienteController.getResumenPorPais:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    async getResumenPorProvincias(req, res) {
        try {
            const { anio } = req.query;

            if (!anio || isNaN(parseInt(anio, 10))) {
                return res.status(400).json({
                    error: "El parámetro 'anio' es obligatorio y debe ser un número.",
                });
            }

            const resumen = await ClienteModel.getResumenPorProvincias(parseInt(anio, 10));
            res.json(resumen);
        } catch (err) {
            console.error('Error en getResumenPorProvincias:', err);
            res.status(500).json({ error: 'Error al obtener el resumen por provincia' });
        }
    }
}