import { ClienteModel } from '../models/Postgres/clients.js';
import { UserModel } from '../models/Postgres/usuarios.js';
import { validateCliente, validatePartialCliente } from '../schemas/clients.js';

const COMMERCIAL_ROLE = 'comercial';

const USER_CLIENT_ACCESS_OVERRIDES = {
    DECOANDYOU: ['430046019'],
};

const normalizeUserClientAccess = (user) => {
    const username = String(user?.username || '').trim().toUpperCase();

    if (USER_CLIENT_ACCESS_OVERRIDES[username]) {
        return {
            codclien: USER_CLIENT_ACCESS_OVERRIDES[username],
            codrepres: undefined,
        };
    }

    const userRole = String(user?.role || '').trim().toLowerCase();

    if (userRole !== COMMERCIAL_ROLE) {
        return {
            codclien: undefined,
            codrepres: undefined,
        };
    }

    const codrepres = [];

    if (user?.codrepre) {
        codrepres.push(String(user.codrepre).trim());
    }

    if (Array.isArray(user?.codrepres)) {
        codrepres.push(
            ...user.codrepres
                .map((codrepre) => String(codrepre).trim())
                .filter(Boolean)
        );
    }

    if (typeof user?.codrepres === 'string') {
        codrepres.push(
            ...user.codrepres
                .replace(/[{}"]/g, '')
                .split(',')
                .map((codrepre) => codrepre.trim())
                .filter(Boolean)
        );
    }

    return {
        codclien: undefined,
        codrepres: [...new Set(codrepres.filter(Boolean))],
    };
};

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

const ensureClientAccess = async (req, res, codclien) => {
    const { codclien: allowedClients, codrepres } = normalizeUserClientAccess(req.user);
    const allowed = await ClienteModel.userCanAccessClient({
        targetCodclien: codclien,
        codclien: allowedClients,
        codrepres,
    });

    if (!allowed) {
        res.status(403).json({
            error: 'CLIENT_NOT_IN_PORTFOLIO',
            message: 'Este cliente no pertenece a tu cartera comercial.',
        });
        return false;
    }

    return true;
};

export class ClienteController {
    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, codpais, codprovi, query, status } = req.query;
            const offset = (Number(page) - 1) * Number(limit);
            const { codclien, codrepres } = normalizeUserClientAccess(req.user);

            const clientes = await ClienteModel.getAll({
                offset,
                limit: Number(limit),
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

            const newCliente = await ClienteModel.create({ input: req.body });
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

            const updatedCliente = await ClienteModel.update({ codclien, input: req.body });

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
            const { page = 1, limit = 10, order = 'DESC' } = req.query;
            const offset = (Number(page) - 1) * Number(limit);
            const { codclien, codrepres } = normalizeUserClientAccess(req.user);

            const clients = await ClienteModel.getClientsWithBilling({
                limit: Number(limit),
                offset,
                order,
                codclien,
                codrepres,
            });

            res.json({ clients });
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