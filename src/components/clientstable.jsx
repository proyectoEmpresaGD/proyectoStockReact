function ClientTable({ clients, handleClientClick }) {
    return (
        <div className="overflow-auto">
            <table className="min-w-full bg-white border font-bold border-gray-300 text-sm">
                <thead className="bg-gray-200">
                    <tr>
                        <th className="px-1 py-1 border-b">Código</th>
                        <th className="px-1 py-1 border-b">Nombre</th>
                        <th className="px-1 py-1 border-b">Localidad</th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map(client => (
                        <tr key={client.codclien} className="border-b hover:bg-gray-100 cursor-pointer" onClick={() => handleClientClick(client.codclien)}>
                            <td className="px-1 py-1">{client.codclien}</td>
                            <td className="px-1 py-1">{client.razclien}</td>
                            <td className="px-1 py-1">{client.localidad}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default ClientTable;