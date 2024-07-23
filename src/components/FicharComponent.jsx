import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import jsPDF from 'jspdf';
import moment from 'moment-timezone';
import FirmaModal from './FirmaModal';

const FicharComponent = () => {
    const { user } = useAuth();
    const [fichajes, setFichajes] = useState([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);

    useEffect(() => {
        if (user?.id) {
            fetchFichajes(user.id);
        }
    }, [user]);

    const fetchFichajes = async (userId) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/fichajes?userId=${userId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setFichajes(data);
        } catch (error) {
            console.error('Error fetching fichajes:', error);
        }
    };

    const getMadridTime = () => {
        return moment().tz('Europe/Madrid').format();
    };

    const handleFichar = async (tipo) => {
        if (!user || !user.id) {
            console.error('User not logged in or user id missing');
            return;
        }

        if (tipo === 'salida') {
            setSelectedDate(new Date().getDate());
            setShowSignatureModal(true);
            return;
        }

        const now = getMadridTime();
        try {
            const requestBody = { userId: user.id, tipo, timestamp: now };
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/fichajes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setFichajes([...fichajes, data]);
        } catch (error) {
            console.error('Error registering fichaje:', error);
        }
    };

    const handleSignatureSubmit = async (signatureData) => {
        if (!signatureData) {
            alert('Debe proporcionar una firma.');
            return;
        }

        const now = getMadridTime();
        try {
            const requestBody = { userId: user.id, tipo: 'salida', timestamp: now, firma: signatureData };
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/fichajes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setFichajes([...fichajes, data]);
            setShowSignatureModal(false);
        } catch (error) {
            console.error('Error registering fichaje with signature:', error);
        }
    };

    const handlePrint = () => {
        const doc = new jsPDF();
        doc.text('Registro de Horas Mensuales', 20, 20);

        // Datos de encabezado
        doc.text('Empresa: CJM WORLDWIDE S.L.', 20, 30);
        doc.text('NIF/CIF: B14570873', 20, 35);
        doc.text(`Trabajador: ${user.name}`, 20, 40);
        doc.text(`DNI: ${user.dni}`, 20, 45);
        doc.text('Mes: Julio', 20, 50);
        doc.text('Año: 2024', 20, 55);

        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const daysInMonth = new Date(year, month, 0).getDate();
        const startY = 70;
        const pageHeight = doc.internal.pageSize.height;
        const rowHeight = 10;

        // Crear tabla manualmente
        doc.text('Día', 20, startY);
        doc.text('Hora Entrada', 40, startY);
        doc.text('Hora Salida', 90, startY);
        doc.text('Firma', 140, startY);

        let rowY = startY + 10;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayFichajes = fichajes.filter(fichaje => new Date(fichaje.timestamp).getDate() === day);
            const entrada = dayFichajes.find(fichaje => fichaje.tipo === 'entrada');
            const salida = dayFichajes.find(fichaje => fichaje.tipo === 'salida');

            // Verificar si se necesita una nueva página
            if (rowY + rowHeight > pageHeight - 20) {
                doc.addPage();
                rowY = 20; // Reiniciar la posición Y en la nueva página
                doc.text('Día', 20, rowY);
                doc.text('Hora Entrada', 40, rowY);
                doc.text('Hora Salida', 90, rowY);
                doc.text('Firma', 140, rowY);
                rowY += 10;
            }

            doc.text(String(day), 20, rowY);
            doc.text(entrada ? moment(entrada.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : '', 40, rowY);
            doc.text(salida ? moment(salida.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : '', 90, rowY);

            if (salida && salida.firma) {
                doc.addImage(salida.firma, 'PNG', 140, rowY - 5, 30, 15);
            }
            rowY += rowHeight;
        }

        doc.save('registro_horas.pdf');
    };

    const renderFichajesTable = () => {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const daysInMonth = new Date(year, month, 0).getDate();
        const rows = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const dayFichajes = fichajes.filter(fichaje => new Date(fichaje.timestamp).getDate() === day);
            const entrada = dayFichajes.find(fichaje => fichaje.tipo === 'entrada');
            const salida = dayFichajes.find(fichaje => fichaje.tipo === 'salida');
            rows.push(
                <tr key={day}>
                    <td className="border px-4 py-2">{day}</td>
                    <td className="border px-4 py-2">{entrada ? moment(entrada.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : ''}</td>
                    <td className="border px-4 py-2">{salida ? moment(salida.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : ''}</td>
                    <td className="border px-4 py-2">
                        {salida && salida.firma ? <img src={salida.firma} alt="Firma" style={{ width: '100px', height: '50px' }} /> : ''}
                    </td>
                </tr>
            );
        }

        return (
            <div className="overflow-auto" style={{ maxHeight: '400px' }}>
                <table className="min-w-full bg-white border font-bold border-gray-300 text-sm">
                    <thead className="bg-gray-200">
                        <tr>
                            <th className="px-1 py-1 border-b text-center">Día</th>
                            <th className="px-1 py-1 border-b">Hora Entrada</th>
                            <th className="px-1 py-1 border-b">Hora Salida</th>
                            <th className="px-1 py-1 border-b">Firma</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Registro de Horas</h1>
            <button onClick={() => handleFichar('entrada')} className="bg-green-500 text-white px-4 py-2 rounded mr-2">Fichar Entrada</button>
            <button onClick={() => handleFichar('salida')} className="bg-red-500 text-white px-4 py-2 rounded mr-2">Fichar Salida</button>
            <button onClick={handlePrint} className="bg-blue-500 text-white px-4 py-2 rounded">Imprimir</button>
            <div className="mt-4">
                <h2 className="text-xl font-bold mb-2">Historial de Fichajes</h2>
                {renderFichajesTable()}
            </div>
            <FirmaModal
                isOpen={showSignatureModal}
                onClose={() => setShowSignatureModal(false)}
                onSave={handleSignatureSubmit}
            />
        </div>
    );
};

export default FicharComponent;
