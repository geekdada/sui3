import type { FieldApi } from '@tanstack/react-form'
import { useId } from 'react'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/cn'

type AnyFieldApi = FieldApi<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>

interface FormFieldProps {
  field: AnyFieldApi
  label: string
  description?: React.ReactNode
  inputProps?: React.ComponentProps<typeof Input>
  className?: string
}

export function FormField({
  field,
  label,
  description,
  inputProps,
  className,
}: FormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`
  const hasError = field.state.meta.errors.length > 0

  const inputId = inputProps?.id ?? id

  return (
    <Field
      className={cn('w-full', className)}
      data-invalid={hasError ? 'true' : undefined}
    >
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        {...inputProps}
        id={inputId}
        name={field.name}
        value={field.state.value as string}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={hasError}
        aria-describedby={
          [
            description ? descriptionId : undefined,
            hasError ? errorId : undefined,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldError id={errorId} errors={field.state.meta.errors} />
    </Field>
  )
}

interface CompactFormFieldProps {
  field: AnyFieldApi
  label: string
  inputProps?: React.ComponentProps<typeof Input>
  className?: string
}

export function CompactFormField({
  field,
  label,
  inputProps,
  className,
}: CompactFormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hasError = field.state.meta.errors.length > 0
  const inputId = inputProps?.id ?? id

  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1', className)}
      data-invalid={hasError ? 'true' : undefined}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Input
        {...inputProps}
        id={inputId}
        name={field.name}
        value={field.state.value as string}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          'h-8 px-2.5 py-1 text-sm',
          inputProps?.className,
        )}
      />
      <FieldError
        id={errorId}
        errors={field.state.meta.errors}
        className="text-xs"
      />
    </div>
  )
}
