// src/components/clientes/modal/InfoTab.jsx
import React, { useMemo } from 'react';
import {
    AiOutlineUser,
    AiOutlineMail,
    AiOutlinePhone,
    AiOutlineHome
} from 'react-icons/ai';
import { FiMapPin } from 'react-icons/fi';
import { provinces } from '../../../Constants/constants';

export default function InfoTab({ client }) {
    // Divide múltiples emails y filtra los válidos
    const emails = useMemo(
        () =>
            (client?.email || '')
                .split(/[,;\s]+/)
                .filter((e) => e.includes('@')),
        [client]
    );

    // Etiqueta legible de la provincia
    const provinceLabel = useMemo(() => {
        const p = provinces.find(
            (x) => x.value === String(client?.codprovi)
        );
        return p?.label || client?.codprovi || '–';
    }, [client]);

    // Las filas de información
    const rows = [
        ['Código', client?.codclien || '–', AiOutlineUser],
        ['Email', emails, AiOutlineMail],
        ['Teléfono', client?.tlfno || '–', AiOutlinePhone],
        ['Dirección', client?.direccion || '–', AiOutlineHome],
        ['Localidad', client?.localidad || '–', FiMapPin],
        ['Provincia', provinceLabel, FiMapPin],
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map(([label, value, Icon]) => (
                <div
                    key={label}
                    className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg shadow-sm"
                >
                    <Icon className="text-gray-600 mt-1" size={20} />
                    <div className="flex-1">
                        <p className="text-xs text-gray-500">{label}</p>

                        {/* Renderizado especial según tipo */}
                        {label === 'Email' ? (
                            emails.length > 0 ? (
                                <ul className="text-sm list-disc list-inside">
                                    {emails.map((email) => (
                                        <li key={email}>
                                            <a
                                                href={`mailto:${email}`}
                                                className="text-blue-600 hover:underline break-all"
                                            >
                                                {email}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm">–</p>
                            )
                        ) : label === 'Teléfono' ? (
                            value !== '–' ? (
                                <a
                                    href={`tel:${value}`}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    {value}
                                </a>
                            ) : (
                                <p className="text-sm">–</p>
                            )
                        ) : label === 'Dirección' && value !== '–' ? (
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                    `${value}, ${client.localidad}, ${provinceLabel}`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline"
                            >
                                {value}
                            </a>
                        ) : (
                            <p className="text-sm">{value}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
