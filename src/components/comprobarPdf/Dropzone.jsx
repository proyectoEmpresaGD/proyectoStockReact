// src/components/comprobarPdf/Dropzone.jsx
import React from 'react';

export default function Dropzone({ onFiles, accept = 'application/pdf' }) {
    const inputRef = React.useRef(null);
    const [isOver, setIsOver] = React.useState(false);

    const handleFiles = (list) => {
        if (!list) return;
        const files = Array.from(list).filter(f => !accept || f.type === accept);
        onFiles?.(files);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsOver(false);
        handleFiles(e.dataTransfer.files);
    };

    return (
        <div
            className={[
                'relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition',
                'bg-white/50 backdrop-blur',
                isOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 hover:bg-gray-50'
            ].join(' ')}
            onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            aria-label="Soltar o seleccionar PDFs"
        >
            <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                <div className="rounded-full border border-dashed p-3">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none">
                        <path d="M12 16V4m0 0l-3 3m3-3l3 3M4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </div>
                <p className="text-sm font-medium">Arrastra aquí los PDFs o haz clic para seleccionarlos</p>
                <p className="text-xs text-gray-600">Sólo se aceptan archivos PDF.</p>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
            />
        </div>
    );
}
