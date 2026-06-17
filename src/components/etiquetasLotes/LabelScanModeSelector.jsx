import React from 'react';
import { LOT_LABEL_SCAN_MODE_OPTIONS } from './productLotLabelConstants';

export default function LabelScanModeSelector({ value, onChange }) {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
                Modo del QR
            </label>

            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                {LOT_LABEL_SCAN_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>

            <p className="text-xs text-slate-500">
                {LOT_LABEL_SCAN_MODE_OPTIONS.find((option) => option.value === value)?.description}
            </p>
        </div>
    );
}