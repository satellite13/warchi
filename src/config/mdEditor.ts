import { config } from 'md-editor-v3'
import type { StaticTextDefaultValue } from 'md-editor-v3'

const ru_RU: StaticTextDefaultValue = {
  toolbarTips: {
    bold: 'Жирный',
    underline: 'Подчёркнутый',
    italic: 'Курсив',
    strikeThrough: 'Зачёркнутый',
    title: 'Заголовок',
    sub: 'Подстрочный',
    sup: 'Надстрочный',
    quote: 'Цитата',
    unorderedList: 'Маркированный список',
    orderedList: 'Нумерованный список',
    task: 'Список задач',
    codeRow: 'Строчный код',
    code: 'Блок кода',
    link: 'Ссылка',
    image: 'Изображение',
    table: 'Таблица',
    mermaid: 'Mermaid',
    katex: 'Формула',
    revoke: 'Отменить',
    next: 'Повторить',
    save: 'Сохранить',
    prettier: 'Prettier',
    pageFullscreen: 'На весь экран (страница)',
    fullscreen: 'На весь экран',
    preview: 'Предпросмотр',
    previewOnly: 'Только просмотр',
    htmlPreview: 'HTML просмотр',
    catalog: 'Оглавление',
    github: 'Исходный код',
  },
  titleItem: {
    h1: 'Заголовок 1',
    h2: 'Заголовок 2',
    h3: 'Заголовок 3',
    h4: 'Заголовок 4',
    h5: 'Заголовок 5',
    h6: 'Заголовок 6',
  },
  imgTitleItem: {
    link: 'Добавить ссылку на изображение',
    upload: 'Загрузить изображение',
    clip2upload: 'Обрезать и загрузить',
  },
  linkModalTips: {
    linkTitle: 'Добавить ссылку',
    imageTitle: 'Добавить изображение',
    descLabel: 'Описание:',
    descLabelPlaceHolder: 'Введите описание...',
    urlLabel: 'Ссылка:',
    urlLabelPlaceHolder: 'Введите ссылку...',
    buttonOK: 'OK',
  },
  clipModalTips: {
    title: 'Обрезать изображение',
    buttonUpload: 'Загрузить',
  },
  copyCode: {
    text: 'Копировать',
    successTips: 'Скопировано!',
    failTips: 'Не удалось скопировать',
  },
  mermaid: {
    flow: 'Блок-схема',
    sequence: 'Последовательность',
    gantt: 'Диаграмма Ганта',
    class: 'Диаграмма классов',
    state: 'Диаграмма состояний',
    pie: 'Круговая диаграмма',
    relationship: 'ER-диаграмма',
    journey: 'Путь пользователя',
  },
  katex: {
    inline: 'Строчная формула',
    block: 'Блочная формула',
  },
  footer: {
    markdownTotal: 'Кол-во символов',
    scrollAuto: 'Автопрокрутка',
  },
}

config({
  editorConfig: {
    languageUserDefined: {
      'ru-RU': ru_RU,
    },
  },
})
