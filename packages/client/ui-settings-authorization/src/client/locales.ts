/** Copy for the provider-card sign-in area and its dialog. */
export const en = {
  connected: 'OAuth connected',
  signIn: 'Sign in with {method}',
  reauthorize: 'Reauthorize',
  busy: 'Signing in…',
  running: 'Complete the sign-in in the opened page, or follow the steps below.',
  submit: 'Submit',
  decline: 'Decline',
  cancel: 'Cancel',
  close: 'Close',
  authorized: 'Signed in.',
  cancelled: 'Sign-in cancelled.',
  failed: 'Sign-in failed.',
}

/** Chinese copy. */
export const zh: Record<keyof typeof en, string> = {
  connected: 'OAuth 已连接',
  signIn: '使用 {method} 登录',
  reauthorize: '重新登录',
  busy: '正在登录…',
  running: '请在打开的页面中完成登录，或按下面的步骤操作。',
  submit: '提交',
  decline: '放弃',
  cancel: '取消',
  close: '关闭',
  authorized: '已登录。',
  cancelled: '登录已取消。',
  failed: '登录失败。',
}

/** Japanese copy, checked against the English keys. */
export const ja = {
  connected: 'OAuth 接続済み',
  signIn: '{method} でサインイン',
  reauthorize: '再認証',
  busy: 'サインイン中…',
  running: '開いたページでサインインを完了するか、以下の手順に従ってください。',
  submit: '送信',
  decline: '拒否',
  cancel: 'キャンセル',
  close: '閉じる',
  authorized: 'サインインしました。',
  cancelled: 'サインインをキャンセルしました。',
  failed: 'サインインに失敗しました。',
} satisfies Record<keyof typeof en, string>

/** Spanish copy, checked against the English keys. */
export const es = {
  connected: 'OAuth conectado',
  signIn: 'Iniciar sesión con {method}',
  reauthorize: 'Volver a autorizar',
  busy: 'Iniciando sesión…',
  running: 'Completa el inicio de sesión en la página abierta o sigue los pasos de abajo.',
  submit: 'Enviar',
  decline: 'Rechazar',
  cancel: 'Cancelar',
  close: 'Cerrar',
  authorized: 'Sesión iniciada.',
  cancelled: 'Inicio de sesión cancelado.',
  failed: 'No se pudo iniciar sesión.',
} satisfies Record<keyof typeof en, string>

/** French copy, checked against the English keys. */
export const fr = {
  connected: 'OAuth connecté',
  signIn: 'Se connecter avec {method}',
  reauthorize: 'Autoriser à nouveau',
  busy: 'Connexion…',
  running: 'Terminez la connexion dans la page ouverte ou suivez les étapes ci-dessous.',
  submit: 'Envoyer',
  decline: 'Refuser',
  cancel: 'Annuler',
  close: 'Fermer',
  authorized: 'Connecté.',
  cancelled: 'Connexion annulée.',
  failed: 'Échec de la connexion.',
} satisfies Record<keyof typeof en, string>

/** German copy, checked against the English keys. */
export const de = {
  connected: 'OAuth verbunden',
  signIn: 'Mit {method} anmelden',
  reauthorize: 'Erneut autorisieren',
  busy: 'Anmeldung läuft…',
  running: 'Schließen Sie die Anmeldung auf der geöffneten Seite ab oder folgen Sie den Schritten unten.',
  submit: 'Senden',
  decline: 'Ablehnen',
  cancel: 'Abbrechen',
  close: 'Schließen',
  authorized: 'Angemeldet.',
  cancelled: 'Anmeldung abgebrochen.',
  failed: 'Anmeldung fehlgeschlagen.',
} satisfies Record<keyof typeof en, string>

/** Russian copy, checked against the English keys. */
export const ru = {
  connected: 'OAuth подключен',
  signIn: 'Войти через {method}',
  reauthorize: 'Авторизоваться снова',
  busy: 'Выполняется вход…',
  running: 'Завершите вход на открытой странице или выполните шаги ниже.',
  submit: 'Отправить',
  decline: 'Отклонить',
  cancel: 'Отмена',
  close: 'Закрыть',
  authorized: 'Вход выполнен.',
  cancelled: 'Вход отменен.',
  failed: 'Не удалось войти.',
} satisfies Record<keyof typeof en, string>

/** Portuguese copy, checked against the English keys. */
export const pt = {
  connected: 'OAuth conectado',
  signIn: 'Entrar com {method}',
  reauthorize: 'Autorizar novamente',
  busy: 'Entrando…',
  running: 'Conclua o login na página aberta ou siga as etapas abaixo.',
  submit: 'Enviar',
  decline: 'Recusar',
  cancel: 'Cancelar',
  close: 'Fechar',
  authorized: 'Login concluído.',
  cancelled: 'Login cancelado.',
  failed: 'Falha no login.',
} satisfies Record<keyof typeof en, string>
