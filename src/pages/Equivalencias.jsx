import LocalizedElement from '../i18n/LocalizedElement.jsx';
import { Link2 } from 'lucide-react';
import EquivalenciasTable from '../components/equivalencias/EquivalenciasTable.jsx';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';

export default function Equivalencias() {
    return (
        <PageShell maxWidth="max-w-6xl">
            <LocalizedElement><PageHeader
                eyebrow="Almacén · Referencias"
                title="Gestión de equivalencias"
                description="Relaciona referencias de CJM con los códigos y descripciones utilizados por cada proveedor."
                icon={Link2}
            /></LocalizedElement>
            <div className="mt-6"><EquivalenciasTable /></div>
        </PageShell>
    );
}
