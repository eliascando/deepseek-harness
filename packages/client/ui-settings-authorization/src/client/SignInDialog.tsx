/**
 * The dialog of one authorization attempt: the flow's notices, the prompt it
 * is blocked on, and the outcome once it settled. Presentation over the
 * surface state; every gesture goes back through the surface.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuthorizationActivity, AuthorizationPromptId, AuthorizationPromptView } from '@deepseek-ai/dsh-api-remotes/client'
import type { en } from './locales.ts'
import css from './SignIn.module.css'

/** Gestures the dialog drives. */
export interface SignInDialogActions {
  /** Answer the prompt with the typed text or the chosen option id. */
  answer(promptId: AuthorizationPromptId, value: string): void
  /** Decline the prompt; the attempt settles cancelled. */
  decline(promptId: AuthorizationPromptId): void
  /** Withdraw the running attempt. */
  cancel(): void
  /** Close the dialog after the attempt settled. */
  dismiss(): void
}

/** What one dialog renders. */
export interface SignInDialogProps {
  /** Dialog title: the flow's label. */
  title: string
  /** The attempt's Host activity; undefined while `begin` has not reached the Host. */
  activity: AuthorizationActivity | undefined
  /** The failure `begin` reported on this page. */
  error: string | undefined
  /** Translate one key of this plugin's namespace. */
  t: (key: keyof typeof en) => string
  /** Gestures. */
  actions: SignInDialogActions
}

function PromptForm({ prompt, t, actions }: {
  prompt: AuthorizationPromptView
  t: SignInDialogProps['t']
  actions: SignInDialogActions
}): ReactNode {
  const [value, setValue] = useState('')
  const decline = (
    <button type="button" className={css['decline']} onClick={() => { actions.decline(prompt.id) }}>
      {t('decline')}
    </button>
  )
  if (prompt.kind === 'select') {
    return (
      <div className={css['prompt']}>
        <p className={css['promptMessage']}>{prompt.message}</p>
        <div className={css['options']}>
          {prompt.options.map(option => (
            <Button key={option.id} variant="outline" title={option.description}
              onClick={() => { actions.answer(prompt.id, option.id) }}>
              {option.label}
            </Button>
          ))}
        </div>
        {decline}
      </div>
    )
  }
  const submit = (): void => {
    if (value.trim() !== '') actions.answer(prompt.id, value)
  }
  return (
    <div className={css['prompt']}>
      <p className={css['promptMessage']}>{prompt.message}</p>
      <input
        className={css['input']}
        type={prompt.kind === 'secret' ? 'password' : 'text'}
        value={value}
        data-modal-autofocus
        placeholder={prompt.placeholder}
        aria-label={prompt.message}
        onChange={(event) => { setValue(event.target.value) }}
        onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
      />
      <div className={css['promptActions']}>
        <Button variant="outline" disabled={value.trim() === ''} onClick={submit}>{t('submit')}</Button>
        {decline}
      </div>
    </div>
  )
}

/**
 * Render one attempt's dialog.
 * @param props - the attempt, copy, and gestures.
 * @returns the open modal.
 */
export function SignInDialog({ title, activity, error, t, actions }: SignInDialogProps): ReactNode {
  const settlement = activity?.settlement ?? (error === undefined ? undefined : 'failed')
  const description = settlement === undefined
    ? t('running')
    : `${t(settlement)}${error === undefined ? '' : ` ${error}`}`
  return (
    <Modal
      open
      onClose={() => { if (settlement === undefined) actions.cancel(); else actions.dismiss() }}
      title={title}
      closeLabel={t('close')}
      description={description}
      className={css['dialog'] as string}
      footer={settlement === undefined
        ? <Button variant="outline" onClick={() => { actions.cancel() }}>{t('cancel')}</Button>
        : <Button variant="outline" data-modal-autofocus onClick={() => { actions.dismiss() }}>{t('close')}</Button>}
    >
      {activity === undefined || activity.notices.length === 0 ? null : (
        <ul className={css['notices']}>
          {activity.notices.map((notice, index) => (
            <li key={index} className={css['notice']}>
              <span>{notice.message}</span>
              {notice.url === undefined ? null
                : <a className={css['noticeLink']} href={notice.url} target="_blank" rel="noreferrer">{notice.url}</a>}
              {notice.code === undefined ? null : <code className={css['noticeCode']}>{notice.code}</code>}
            </li>
          ))}
        </ul>
      )}
      {activity?.prompt === undefined ? null
        : <PromptForm key={activity.prompt.id} prompt={activity.prompt} t={t} actions={actions} />}
    </Modal>
  )
}
