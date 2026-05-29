/**
 * Russian string catalog. Every visible string in the UI is read from here so
 * that an English catalog with the same shape can be added later without
 * touching components. `Strings` is the contract each locale must satisfy.
 */
export const ru = {
  app: {
    name: "Sociograph",
    tagline: "Консоль оператора",
  },
  topbar: {
    week: "Неделя",
    quarter: "Квартал",
    actionPoints: "Очки действий",
    cash: "Капитал",
    runway: "Запас хода",
    exposure: "Засветка",
    reputation: "Репутация",
    empty: "—",
  },
  board: {
    title: "Социограмма",
    hint: "Перетаскивайте контакты из белой зоны в красную, наращивая отношенческий капитал.",
    zones: {
      white: "Белая",
      blue: "Синяя",
      yellow: "Жёлтая",
      red: "Красная",
    },
  },
  dossier: {
    title: "Досье",
    empty: "Выберите контакт на социограмме, чтобы увидеть мотивы и ресурсы.",
  },
  company: {
    title: "Компания",
    empty: "Денежный поток, продукт и сделки появятся здесь.",
  },
  log: {
    title: "Лента событий",
    empty: "Событий пока нет.",
  },
} as const;

export type Strings = typeof ru;
