// import React from 'react';
// import { useNotifications } from '../../contexts/NotificationContext';

// function GlobalNotifications() {
//     const { notifications, removeNotification } = useNotifications();

//     if (!notifications.length) return null; // Si no hay notificaciones, no renderiza nada

//     return (
//         // Un overlay semitransparente que rellena toda la pantalla
//         <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
//             {/* Contenedor que acumula todas las notificaciones en columna */}
//             <div className="flex flex-col space-y-4 px-2 w-full max-w-lg">
//                 {notifications.map((notif) => (
//                     <div
//                         key={notif.id}
//                         className="bg-white shadow-lg rounded-lg border border-gray-200 p-4
//                        transform transition-all duration-300 ease-out
//                        hover:scale-105"
//                     >
//                         <p className="font-semibold text-gray-700 mb-2">{notif.message}</p>
//                         <button
//                             className="text-sm text-blue-500 hover:underline"
//                             onClick={() => removeNotification(notif.id)}
//                         >
//                             Cerrar
//                         </button>
//                     </div>
//                 ))}
//             </div>
//         </div>
//     );
// }

// export default GlobalNotifications;
