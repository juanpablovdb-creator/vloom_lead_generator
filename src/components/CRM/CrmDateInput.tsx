// =====================================================
// Date input with a visible calendar control (dark-theme safe)
// =====================================================
import { useRef } from 'react';
import { Calendar } from 'lucide-react';

export interface CrmDateInputProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  title: string;
  /**
   * `light` = campo completo claro (reutilizable en otras barras).
   * `dark` = tema oscuro de la app (`background` / `foreground`); esquina del calendario clara con icono oscuro.
   */
  fieldTone?: 'light' | 'dark';
  /** Appended to the outer wrapper (e.g. `w-full max-w-xs`) */
  wrapperClassName?: string;
  /** Appended to the native date input (e.g. `text-sm`) */
  inputClassName?: string;
  onBlur?: () => void;
}

export function CrmDateInput({
  value,
  onChange,
  title,
  fieldTone = 'light',
  wrapperClassName = '',
  inputClassName = '',
  onBlur,
}: CrmDateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      el.click();
    }
  };

  const isDark = fieldTone === 'dark';

  const shell = isDark
    ? `flex min-w-[9.5rem] items-stretch overflow-hidden rounded-md border border-border text-xs ${wrapperClassName}`.trim()
    : `flex min-w-[9.5rem] items-stretch overflow-hidden rounded-md border border-neutral-300 bg-white text-xs shadow-sm ${wrapperClassName}`.trim();

  const inputCls = isDark
    ? `crm-date-field-dark min-w-0 flex-1 border-0 bg-background px-3 py-1.5 font-semibold text-foreground outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden ${inputClassName}`.trim()
    : `min-w-0 flex-1 border-0 bg-white px-2 py-1.5 text-neutral-900 outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:hidden ${inputClassName}`.trim();

  const btnCls = isDark
    ? 'flex min-w-[2.75rem] shrink-0 items-center justify-center border-l border-neutral-900 bg-white px-2 text-neutral-900 hover:bg-neutral-50'
    : 'flex shrink-0 items-center justify-center border-l border-neutral-200 bg-neutral-100 px-2.5 text-neutral-800 hover:bg-neutral-200';

  return (
    <div className={shell} style={{ colorScheme: isDark ? 'dark' : 'light' }}>
      <input
        ref={inputRef}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        onBlur={onBlur}
        title={title}
        className={inputCls}
      />
      <button
        type="button"
        onClick={openPicker}
        className={btnCls}
        title={title}
        aria-label={title}
      >
        <Calendar
          className={isDark ? 'h-[18px] w-[18px] text-black' : 'h-4 w-4 text-neutral-800'}
          strokeWidth={isDark ? 2 : 2.25}
        />
      </button>
    </div>
  );
}
