import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SelectFieldItem {
  value: string
  label: string
}

interface SelectFieldProps {
  /** Options to render; also drives the trigger's displayed value. */
  items: SelectFieldItem[]
  value: string
  onValueChange: (value: string) => void
  /** Accessible name for the trigger (`aria-label`). */
  label: string
  disabled?: boolean
  size?: "sm" | "default"
  className?: string
}

/**
 * A single-select dropdown wired up from a flat `items` list, so callers don't
 * have to repeat the Trigger/Value/Content/Item scaffolding. See the primitives
 * in `@/components/ui/select` for lower-level composition.
 */
function SelectField({
  items,
  value,
  onValueChange,
  label,
  disabled,
  size,
  className,
}: SelectFieldProps) {
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as string)}
    >
      <SelectTrigger aria-label={label} size={size} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default SelectField
