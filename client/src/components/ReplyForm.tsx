import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Field, FieldError } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage } from "@/lib/api"
import {
  createReply,
  polishReply,
  ticketRepliesQueryKey,
  type Reply,
  type Ticket,
} from "@/lib/tickets"

const replySchema = z.object({
  body: z.string().trim().min(1, "Reply cannot be empty"),
})

type ReplyFormValues = z.infer<typeof replySchema>

interface ReplyFormProps {
  ticket: Ticket
}

function ReplyForm({ ticket }: ReplyFormProps) {
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm<ReplyFormValues>({
    resolver: zodResolver(replySchema),
    defaultValues: { body: "" },
  })

  const mutation = useMutation({
    mutationFn: (data: ReplyFormValues) => createReply(ticket.id, data.body),
    onSuccess: (created) => {
      queryClient.setQueryData<Reply[]>(
        ticketRepliesQueryKey(ticket.id),
        (replies) => [...(replies ?? []), created]
      )
    },
  })

  const polishMutation = useMutation({
    mutationFn: (body: string) => polishReply(ticket.id, body),
  })

  // Both actions write to the same textarea, so neither runs while the other is
  // in flight.
  const isBusy = isSubmitting || polishMutation.isPending

  // Gate both actions on there being a non-empty draft rather than letting an
  // empty submit through to surface a "Reply cannot be empty" error: an empty
  // reply is nothing to send and nothing to polish, so the buttons are simply
  // disabled until the agent types something. `.trim()` mirrors the schema so
  // whitespace-only input counts as empty too.
  const draft = useWatch({ control, name: "body" })
  const isEmpty = (draft ?? "").trim().length === 0
  const isDisabled = isBusy || isEmpty

  async function onSubmit(data: ReplyFormValues) {
    setError(null)

    try {
      await mutation.mutateAsync(data)
      reset()
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to send reply"))
    }
  }

  async function onPolish() {
    setError(null)

    try {
      const polished = await polishMutation.mutateAsync(getValues("body"))
      setValue("body", polished, { shouldDirty: true })
    } catch (err) {
      // The draft is left untouched so a failed polish can't lose the agent's work.
      setError(getApiErrorMessage(err, "Failed to polish reply"))
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <Controller
        name="body"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <Textarea
              {...field}
              aria-label="Reply"
              aria-invalid={fieldState.invalid}
              placeholder="Write a reply..."
              rows={4}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      {error && <FieldError>{error}</FieldError>}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onPolish}
          disabled={isDisabled}
        >
          {polishMutation.isPending ? "Polishing..." : "Polish"}
        </Button>
        <Button type="submit" disabled={isDisabled}>
          {isSubmitting ? "Sending..." : "Send Reply"}
        </Button>
      </div>
    </form>
  )
}

export default ReplyForm
