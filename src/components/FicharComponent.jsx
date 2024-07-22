// FicharComponent.jsx
import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import jsPDF from 'jspdf';

const FicharComponent = () => {
    const { user } = useAuth();
    const [fichajes, setFichajes] = useState([]);

    useEffect(() => {
        console.log("User in FicharComponent:", user);
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

    const handleFichar = async (tipo) => {
        if (!user || !user.id) {
            console.error('User not logged in or user id missing');
            return;
        }

        const now = new Date().toISOString();
        try {
            const requestBody = { userId: user.id, tipo, timestamp: now };
            console.log("Sending request body:", requestBody); // Debugging log
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

    const handlePrint = () => {
        const doc = new jsPDF();
        doc.text('Registro de Horas Mensuales', 20, 20);
        let startY = 40;
        fichajes.forEach((fichaje, index) => {
            doc.text(`${index + 1}. ${fichaje.tipo} - ${new Date(fichaje.timestamp).toLocaleString()}`, 20, startY);
            startY += 10;
        });
        doc.save('registro_horas.pdf');
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Registro de Horas</h1>
            <button onClick={() => handleFichar('entrada')} className="bg-green-500 text-white px-4 py-2 rounded mr-2">Fichar Entrada</button>
            <button onClick={() => handleFichar('salida')} className="bg-red-500 text-white px-4 py-2 rounded mr-2">Fichar Salida</button>
            <button onClick={handlePrint} className="bg-blue-500 text-white px-4 py-2 rounded">Imprimir</button>
            <div className="mt-4">
                <h2 className="text-xl font-bold mb-2">Historial de Fichajes</h2>
                <ul>
                    {fichajes.map((fichaje) => (
                        <li key={fichaje.id}>
                            {fichaje.tipo} - {new Date(fichaje.timestamp).toLocaleString()}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default FicharComponent;
