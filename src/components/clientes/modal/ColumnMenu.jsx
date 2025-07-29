import React, { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiEye, FiEyeOff } from 'react-icons/fi';

export default function ColumnMenu({ allColumns, visibleCols, setVisibleCols }) {
    const [open, setOpen] = useState(false);
    const ref = useRef();

    useEffect(() => {
        function onClick(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm flex items-center gap-1"
            >
                Columnas <FiChevronDown />
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow-lg z-10">
                    {allColumns.map(col => {
                        const isVisible = visibleCols.includes(col.key);
                        return (
                            <label
                                key={col.key}
                                className="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={isVisible}
                                    onChange={() =>
                                        setVisibleCols(v =>
                                            isVisible ? v.filter(x => x !== col.key) : [...v, col.key]
                                        )
                                    }
                                    className="mr-2"
                                />
                                {isVisible ? <FiEye /> : <FiEyeOff />}
                                <span className="ml-2">{col.label}</span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
