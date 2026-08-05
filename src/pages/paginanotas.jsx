import React from 'react';
import PageShell from '../common/PageShell.jsx';
import AgendaWorkspace from '../components/agenda2/AgendaWorkspace.jsx';

export default function NotasPage() {
    return (
        <PageShell maxWidth="max-w-[1500px]" className="agenda2-page-shell">
            <AgendaWorkspace initialTab="notas" />
        </PageShell>
    );
}
