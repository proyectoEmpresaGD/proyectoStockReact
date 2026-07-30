import Select from 'react-select';
import {
  BUSINESS_UNIT_KEYS,
  getSeriesForBusinessUnit,
} from '../../Constants/facturacionSeries';

export default function GeographySeriesFilter({ availableSeries = [], selectedSeries = [], onChange }) {
  const options = availableSeries.map((serie) => ({ value: serie, label: serie }));
  const selected = new Set(selectedSeries);

  const applyUnit = (unit) => {
    if (unit === BUSINESS_UNIT_KEYS.ALL) {
      onChange([]);
      return;
    }
    onChange(getSeriesForBusinessUnit(availableSeries, unit));
  };

  return (
    <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Series incluidas en los mapas</h2>
          <p className="text-xs text-slate-500">Vacío significa todas. La selección se mantiene al cambiar entre España y Global.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => applyUnit(BUSINESS_UNIT_KEYS.ALL)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Todas</button>
          <button type="button" onClick={() => applyUnit(BUSINESS_UNIT_KEYS.FABRIC)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Tejido</button>
          <button type="button" onClick={() => applyUnit(BUSINESS_UNIT_KEYS.PROJECTS)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Contract</button>
        </div>
      </div>
      <Select
        isMulti
        options={options}
        value={options.filter((option) => selected.has(option.value))}
        onChange={(values) => onChange((values || []).map((item) => item.value))}
        placeholder="Todas las series"
        noOptionsMessage={() => 'No hay series disponibles'}
      />
    </div>
  );
}
