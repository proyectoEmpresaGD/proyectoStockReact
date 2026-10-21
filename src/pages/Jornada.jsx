import LocalizedElement from '../i18n/LocalizedElement.jsx';
import { Clock3 } from 'lucide-react';
import PageHeader from '../common/PageHeader';
import PageShell from '../common/PageShell';
import JornadaModule from '../components/jornada/JornadaModule';

export default function JornadaPage() {
    return (
        <PageShell maxWidth="max-w-7xl">
            <LocalizedElement><PageHeader
                eyebrow="Recursos humanos · Registro de jornada"
                title="Mi jornada"
                description="Registro diario para trabajo presencial, teletrabajo y movilidad, con pausas, incidencias y trazabilidad."
                icon={Clock3}
            /></LocalizedElement>
            <div className="mt-6">
                <JornadaModule />
            </div>
        </PageShell>
    );
}
