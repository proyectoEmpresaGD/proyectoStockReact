import { useState, useEffect } from 'react';
import { useAuthContext } from '../../Auth/AuthContext.jsx'; // Cambiado a useAuthContext
import jsPDF from 'jspdf';
import moment from 'moment-timezone';
import FirmaModal from './FirmaModal';

const FicharComponent = () => {
    const { user, logout } = useAuthContext(); // Obtener información del usuario y función de logout
    const [fichajes, setFichajes] = useState([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [totalHoras, setTotalHoras] = useState(0);
    var nada;

    useEffect(() => {
        if (user?.id) {
            fetchFichajes(user.id);
        }
    }, [user]);

    useEffect(() => {
        calculateTotalHours();
    }, [fichajes]);

    const fetchFichajes = async (userId) => {
        const token = localStorage.getItem('token'); // Obtener el token JWT
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/fichajes?userId=${userId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.status === 401) {
                logout(); // Redirigir si el token ha expirado o no es válido
            }
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

        const token = localStorage.getItem('token'); // Obtener el token JWT

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
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            });
            if (response.status === 401) {
                logout(); // Redirigir si el token ha expirado o no es válido
            }
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

        const token = localStorage.getItem('token'); // Obtener el token JWT
        const now = getMadridTime();
        try {
            const requestBody = { userId: user.id, tipo: 'salida', timestamp: now, firma: signatureData };
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/fichajes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            });
            if (response.status === 401) {
                logout(); // Redirigir si el token ha expirado o no es válido
            }
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

    const calculateTotalHours = () => {
        let total = 0;
        const fichajesByDate = fichajes.reduce((acc, curr) => {
            const date = moment(curr.timestamp).format('YYYY-MM-DD');
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(curr);
            return acc;
        }, {});

        Object.values(fichajesByDate).forEach(fichajes => {
            const entradas = fichajes.filter(f => f.tipo === 'entrada').map(f => moment(f.timestamp));
            const salidas = fichajes.filter(f => f.tipo === 'salida').map(f => moment(f.timestamp));

            for (let i = 0; i < entradas.length; i++) {
                if (salidas[i]) {
                    total += salidas[i].diff(entradas[i], 'hours', true);
                }
            }
        });

        setTotalHoras(total.toFixed(2));
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

        const columnWidth = 30;

        // Crear tabla manualmente
        doc.text('Día', 20, startY);
        doc.text('Hora Entrada Mañana', 20 + columnWidth, startY);
        doc.text('Hora Salida Mañana', 20 + 2 * columnWidth, startY);
        doc.text('Hora Entrada Tarde', 20 + 3 * columnWidth, startY);
        doc.text('Hora Salida Tarde', 20 + 4 * columnWidth, startY);
        doc.text('Firma', 20 + 5 * columnWidth, startY);

        let rowY = startY + 10;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayFichajes = fichajes.filter(fichaje => new Date(fichaje.timestamp).getDate() === day);
            const morningEntradas = dayFichajes.filter(fichaje => fichaje.tipo === 'entrada' && new Date(fichaje.timestamp).getHours() < 12);
            const morningSalidas = dayFichajes.filter(fichaje => fichaje.tipo === 'salida' && new Date(fichaje.timestamp).getHours() < 12);
            const afternoonEntradas = dayFichajes.filter(fichaje => fichaje.tipo === 'entrada' && new Date(fichaje.timestamp).getHours() >= 12);
            const afternoonSalidas = dayFichajes.filter(fichaje => fichaje.tipo === 'salida' && new Date(fichaje.timestamp).getHours() >= 12);

            const morningEntrada = morningEntradas[0];
            const morningSalida = morningSalidas[0];
            const afternoonEntrada = afternoonEntradas[0];
            const afternoonSalida = afternoonSalidas[0];

            // Verificar si se necesita una nueva página
            if (rowY + rowHeight > pageHeight - 20) {
                doc.addPage();
                rowY = 20; // Reiniciar la posición Y en la nueva página
                doc.text('Día', 20, rowY);
                doc.text('Hora Entrada Mañana', 20 + columnWidth, rowY);
                doc.text('Hora Salida Mañana', 20 + 2 * columnWidth, rowY);
                doc.text('Hora Entrada Tarde', 20 + 3 * columnWidth, rowY);
                doc.text('Hora Salida Tarde', 20 + 4 * columnWidth, rowY);
                doc.text('Firma', 20 + 5 * columnWidth, rowY);
                rowY += 10;
            }

            doc.text(String(day), 20, rowY);
            doc.text(morningEntrada ? moment(morningEntrada.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : '', 20 + columnWidth, rowY);
            doc.text(morningSalida ? moment(morningSalida.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : '', 20 + 2 * columnWidth, rowY);
            doc.text(afternoonEntrada ? moment(afternoonEntrada.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : '', 20 + 3 * columnWidth, rowY);
            doc.text(afternoonSalida ? moment(afternoonSalida.timestamp).tz('Europe/Madrid').format('HH:mm:ss') : '', 20 + 4 * columnWidth, rowY);

            if (morningSalida && morningSalida.firma) {
                doc.addImage(morningSalida.firma, 'PNG', 20 + 5 * columnWidth, rowY - 5, 30, 15);
            }
            if (afternoonSalida && afternoonSalida.firma) {
                doc.addImage(afternoonSalida.firma, 'PNG', 20 + 5 * columnWidth, rowY - 5, 30, 15);
            }
            rowY += rowHeight;
        }

        doc.text(`Total Horas Realizadas: ${totalHoras}`, 20, rowY + 10);
        doc.save('registro_horas.pdf');
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4 text-center">Registro de Horas</h1>
            <div className="flex flex-col sm:flex-row justify-center mb-4">
                <button onClick={() => handleFichar('entrada')} className="bg-green-500 text-white px-4 py-2 rounded mb-2 sm:mb-0 sm:mr-2">Fichar Entrada</button>
                <button onClick={() => handleFichar('salida')} className="bg-red-500 text-white px-4 py-2 rounded mb-2 sm:mb-0 sm:mr-2">Fichar Salida</button>
                <button onClick={handlePrint} className="bg-blue-500 text-white px-4 py-2 rounded">Imprimir</button>
            </div>
            <div className="mt-4">
                <h2 className="text-xl font-bold mb-2 text-center">Historial de Fichajes</h2>
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
