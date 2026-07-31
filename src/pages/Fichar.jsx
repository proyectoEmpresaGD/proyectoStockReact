import { Clock3 } from 'lucide-react';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import FicharComponent from '../components/fichar/FicharComponent.jsx';

export default function FicharPage() {
    return (
        <PageShell maxWidth="max-w-6xl">
            <PageHeader
                eyebrow="Recursos humanos · Jornada"
                title="Registro de horas"
                description="Registra entradas y salidas, consulta el historial mensual y descarga el resumen en PDF."
                icon={Clock3}
            />
            <div className="mt-6"><FicharComponent /></div>
        </PageShell>
    );
}
