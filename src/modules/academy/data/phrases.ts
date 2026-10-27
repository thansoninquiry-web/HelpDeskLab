/**
 * Basic IT support Spanish, as study cards.
 *
 * The point is not fluency. It is the six or seven sentences that let a
 * technician start a call, describe the next step, and agree a follow-up with a
 * Spanish-first caller, plus the vocabulary that comes up in a school.
 */
export interface PhraseCard {
  id: string
  es: string
  en: string
  /** Where this one earns its keep. */
  when: string
  group: 'opening' | 'diagnose' | 'reassure' | 'handover'
}

export const PHRASES: readonly PhraseCard[] = [
  {
    id: 'good-morning',
    es: 'Buenos días. ¿En qué puedo ayudarle?',
    en: 'Good morning. How can I help you?',
    when: 'The first line of every call and every counter conversation.',
    group: 'opening',
  },
  {
    id: 'who-and-room',
    es: '¿Me confirma su nombre y el aula, por favor?',
    en: 'Could you confirm your name and the room, please?',
    when: 'Before you touch an account or walk to a room.',
    group: 'opening',
  },
  {
    id: 'did-you-restart',
    es: '¿Ha reiniciado el equipo?',
    en: 'Have you restarted it?',
    when: 'The first diagnostic question, asked without sounding like an accusation.',
    group: 'diagnose',
  },
  {
    id: 'error-message',
    es: '¿Puede ver un mensaje de error? ¿Me lo puede leer o enviar una foto?',
    en: 'Can you see an error message? Could you read it to me or send a photo?',
    when: 'Getting the words on the screen instead of a description of them.',
    group: 'diagnose',
  },
  {
    id: 'when-did-it-start',
    es: '¿Cuándo empezó a fallar?',
    en: 'When did it start failing?',
    when: 'Ties the fault to an update, a move or a power cut.',
    group: 'diagnose',
  },
  {
    id: 'only-one',
    es: '¿Le pasa solo a usted o a más personas?',
    en: 'Is it only you, or is it affecting other people too?',
    when: 'The question that separates one machine from a room or a network.',
    group: 'diagnose',
  },
  {
    id: 'check-the-cable',
    es: '¿Puede comprobar que el cable esté bien conectado en los dos extremos?',
    en: 'Could you check the cable is firmly connected at both ends?',
    when: 'Projectors, printers and the machine at the back of the lab.',
    group: 'diagnose',
  },
  {
    id: 'i-am-coming',
    es: 'Voy ahora mismo.',
    en: 'I’m on my way now.',
    when: 'A room call where the teacher is standing next to the fault.',
    group: 'reassure',
  },
  {
    id: 'a-few-minutes',
    es: 'Deme unos minutos y le aviso.',
    en: 'Give me a few minutes and I’ll let you know.',
    when: 'When you cannot promise the fix, only the update.',
    group: 'reassure',
  },
  {
    id: 'before-the-bell',
    es: 'Voy a intentar tenerlo listo antes del timbre.',
    en: 'I’ll try to have it ready before the bell.',
    when: 'A classroom call where the lesson is about to start.',
    group: 'reassure',
  },
  {
    id: 'spare',
    es: 'Tengo un equipo de repuesto mientras reparamos el suyo.',
    en: 'I have a spare machine while we repair yours.',
    when: 'A dead laptop or a projector that has to come down.',
    group: 'reassure',
  },
  {
    id: 'cannot-share-password',
    es: 'No puedo compartir la contraseña de administrador, pero puedo desbloquear su cuenta.',
    en: 'I can’t share the administrator password, but I can unlock your account.',
    when: 'The request that has to be refused, said kindly.',
    group: 'reassure',
  },
  {
    id: 'temporary-password',
    es: 'Le doy una contraseña temporal y la cambia al entrar.',
    en: 'I’ll give you a temporary password and you change it at sign-in.',
    when: 'Every password reset, every time.',
    group: 'handover',
  },
  {
    id: 'saved-to-drive',
    es: 'Sus archivos están en la unidad compartida, no en el equipo.',
    en: 'Your files are on the shared drive, not on the machine.',
    when: 'Before a reimage or a profile rebuild.',
    group: 'handover',
  },
  {
    id: 'loan-record',
    es: 'Apunto el portátil, el cargador y la fecha de devolución.',
    en: 'I’ll record the laptop, the charger and the return date.',
    when: 'Handing a loaner to a parent or a pupil.',
    group: 'handover',
  },
  {
    id: 'call-me-back',
    es: 'Si vuelve a pasar, llámeme y lo miro otra vez.',
    en: 'If it happens again, call me and I’ll look again.',
    when: 'Closing a call where the fault may come back.',
    group: 'handover',
  },
]

export const PHRASE_GROUPS: Readonly<Record<PhraseCard['group'], string>> = {
  opening: 'Opening the call',
  diagnose: 'Finding the fault',
  reassure: 'Saying what happens next',
  handover: 'Handing over and closing',
}

/** The vocabulary a school ticket uses, in both languages. */
export const GLOSSARY: readonly { es: string; en: string }[] = [
  { es: 'el aula', en: 'the classroom' },
  { es: 'el timbre', en: 'the bell' },
  { es: 'el proyector', en: 'the projector' },
  { es: 'la pantalla', en: 'the screen / panel' },
  { es: 'el cable', en: 'the cable' },
  { es: 'la impresora', en: 'the printer' },
  { es: 'el cargador', en: 'the charger' },
  { es: 'el portátil', en: 'the laptop' },
  { es: 'la contraseña', en: 'the password' },
  { es: 'la cuenta bloqueada', en: 'the locked account' },
  { es: 'la unidad compartida', en: 'the shared drive' },
  { es: 'el préstamo', en: 'the loan' },
  { es: 'la devolución', en: 'the return' },
  { es: 'el parte de incidencia', en: 'the ticket' },
]
