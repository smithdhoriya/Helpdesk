import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Field, FieldError } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage } from "@/lib/api"
import {
  createReply,
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
    handleSubmit,
    reset,
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

  async function onSubmit(data: ReplyFormValues) {
    setError(null)

    try {
      await mutation.mutateAsync(data)
      reset()
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to send reply"))
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

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send Reply"}
        </Button>
      </div>
    </form>
  )
}

export default ReplyForm
