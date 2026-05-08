const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const getAuthHeaders = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
});

const handleResponse = async (response) => {
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Error en la petición de reservas.');
    }

    return data;
};

export const reservasClient = {
    async getReservas({ token }) {
        const response = await fetch(`${API_BASE_URL}/api/reservas`, {
            headers: getAuthHeaders(token),
        });

        return handleResponse(response);
    },

    async createReserva({ token, reserva }) {
        const response = await fetch(`${API_BASE_URL}/api/reservas`, {
            method: 'POST',
            headers: getAuthHeaders(token),
            body: JSON.stringify(reserva),
        });

        return handleResponse(response);
    },

    async updateReserva({ token, idreserva, reserva }) {
        const response = await fetch(`${API_BASE_URL}/api/reservas/${idreserva}`, {
            method: 'PATCH',
            headers: getAuthHeaders(token),
            body: JSON.stringify(reserva),
        });

        return handleResponse(response);
    },

    async deleteReserva({ token, idreserva }) {
        const response = await fetch(`${API_BASE_URL}/api/reservas/${idreserva}`, {
            method: 'DELETE',
            headers: getAuthHeaders(token),
        });

        return handleResponse(response);
    },

    async getReservasProducto({ token, codprodu }) {
        const response = await fetch(`${API_BASE_URL}/api/reservas/producto/${codprodu}`, {
            headers: getAuthHeaders(token),
        });

        return handleResponse(response);
    },

    async getLotesDisponibles({ token, codprodu }) {
        const response = await fetch(`${API_BASE_URL}/api/reservas/lotes/${codprodu}`, {
            headers: getAuthHeaders(token),
        });

        return handleResponse(response);
    },
};