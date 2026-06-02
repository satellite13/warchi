/* global window, document, localStorage */
(function () {
  var STORAGE_KEY = 'warchi.locale';
  var SUPPORTED = ['ru', 'en'];

  var STRINGS = {
    ru: {
      pageTitle: 'wArchi — архитектурный репозиторий',
      langSwitcherAria: 'Язык интерфейса',
      navFeatures: 'Возможности',
      navPlatform: 'Платформа',
      navAudience: 'Для кого',
      navFaq: 'FAQ',
      navDocs: 'Документация',
      navLogin: 'Войти',
      heroTagSuffix: ' — open source, self-hosted',
      heroTitleHtml:
        'Архитектурный<br />\n          <span class="accent-word">репозиторий</span><br />\n          нового поколения',
      heroSub:
        'Единая метамодель и нотации ArchiMate / C4 / BPMN / UML, серверное SemVer, синхронизация изменений модели в реальном времени, блокировка редактирования диаграммы, трассировка связей и разрешение конфликтов при сохранении — всё в браузере, без обмена файлами.',
      ctaTryFree: 'Попробовать бесплатно',
      ctaReadDocs: 'Читать документацию',
      visualTitle: 'wArchi — редактор диаграмм',
      imgAlt: 'Интерфейс wArchi',
      statNotations: 'Нотации',
      statVersioning: 'Версионирование',
      statLiveSync: 'Синхронизация модели',
      statLicense: 'Лицензия',
      featuresLabel: 'Возможности',
      featuresHeadingHtml: 'Всё для enterprise-<br>архитектуры',
      featuresSub:
        'От моделирования до совместной работы: live-обновления дерева и связей, аккуратные блокировки на canvas и понятные сценарии при конфликте сохранения.',
      f1t: 'Единая метамодель',
      f1p:
        'Связывайте бизнес, приложения и технологии без дублирования. Каждый элемент живёт в модели один раз.',
      f2t: 'Совместная работа',
      f2p:
        'Несколько человек в одной модели: изменения нод и связей подтягиваются без перезагрузки страницы. Редактирование последней версии диаграммы защищено блокировкой.',
      f3t: 'Версионирование',
      f3p:
        'Сравнивайте версии моделей и диаграмм, ведите историю на сервере по SemVer. При расхождении с сервером — сравнение полей и выбор: подтянуть данные или перезаписать.',
      f4t: 'Canvas-редактор',
      f4p:
        'Диаграммы в браузере с привязкой к типам нотации. Панель трассировки показывает, какие связи уже на открытой диаграмме; допустимые связи можно перетащить на холст.',
      f5t: 'On-premises',
      f5p: 'Полный контроль: разворачивайте в закрытом контуре. Docker, Kubernetes, Helm-чарт из коробки.',
      f6t: 'REST и события',
      f6p:
        'REST и OpenAPI для интеграций, JWT-аутентификация. Для live-сценариев — подписка на обновления модели по WebSocket/STOMP (режим настраивается на клиенте).',
      platformLabel: 'Платформа',
      platformHeading: 'Как это устроено',
      platformSub: 'Архитектура, знакомая инженерам — стандартные инструменты, открытый стек.',
      bentoNotationsT: 'Нотации',
      bentoNotationsP: 'Поддерживаем популярные фреймворки. Создавайте собственные нотации и типы элементов.',
      bentoVersionT: 'История версий',
      bentoVersionP:
        'Каждое изменение фиксируется. Сравнивайте версии, разбирайте конфликты пакетного сохранения по полям, откатывайте при необходимости.',
      vtree1: 'Добавлен слой мотивации',
      vtree1time: '2 мин',
      vtree2: 'Обновлены бизнес-процессы',
      vtree2time: '1 час',
      vtree3: 'Первичная структура',
      vtree3time: 'вчера',
      quickstartT: 'Быстрый старт',
      quickstartP: 'Три команды — и репозиторий готов к работе.',
      termC1: '# backend на :8080 (нужен PostgreSQL)',
      termC2: '# frontend на :5173',
      termC3: '# открыть wArchi',
      termC4: '# Опционально: curl -s localhost:8080/api/v1/models | jq',
      audienceLabel: 'Для кого',
      audienceHeadingHtml: 'Создан для команд,<br>управляющих архитектурой',
      audienceSub: 'Enterprise-архитекторы, аналитики и платформенные инженеры.',
      aud1role: 'Architect',
      aud1t: 'Архитекторы',
      aud1p:
        'Ведите целевую и текущую архитектуру в единой модели. Используйте трассировку и версии, чтобы видеть зависимости и эволюцию.',
      aud2role: 'Analyst',
      aud2t: 'Аналитики',
      aud2p: 'Привязывайте процессы и требования к архитектурным элементам. Визуализируйте связи на диаграммах.',
      aud3role: 'Platform',
      aud3t: 'CTO и платформенные команды',
      aud3p: 'Разворачивайте on-premises, интегрируйте через REST API, управляйте стандартами нотаций.',
      faqLabel: 'FAQ',
      faqHeading: 'Частые вопросы',
      faqSub: 'Ответы на ключевые вопросы о платформе.',
      faq1q: 'Можно ли мигрировать с Archi?',
      faq1a:
        'Да, сценарии моделирования близки к привычным, при этом добавляется веб-коллаборация и серверное версионирование. Модели можно импортировать и продолжить работу в браузере.',
      faq2q: 'Есть ли on-premises вариант?',
      faq2a:
        'Да, wArchi разворачивается в закрытом контуре: Docker Compose или Kubernetes. Полный контроль над данными и доступом.',
      faq3q: 'Какая лицензия?',
      faq3a:
        'AGPL-3.0-or-later для open source. Для корпоративных сценариев без AGPL-ограничений доступна коммерческая лицензия.',
      faq4q: 'Какие нотации поддерживаются?',
      faq4a:
        'ArchiMate 3.2, C4 Model, BPMN 2.0, UML. Кроме того, можно создавать собственные нотации с пользовательскими типами элементов.',
      faq5q: 'Как устроено одновременное редактирование?',
      faq5a:
        'Состояние модели (ноды, связи) может обновляться у всех открывших модель через live sync. Редактирование последней версии одной диаграммы защищается блокировкой: второй пользователь видит, что canvas занят, и может работать в режиме просмотра или с другой диаграммой.',
      deployLabel: 'Self-hosted',
      deployHeading: 'Развёртывание',
      deploySub: 'Разверните wArchi в своём контуре за несколько команд.',
      dockerT: 'Docker',
      dockerP:
        'Быстрый старт для локальной разработки и небольших команд. Требуется доступный PostgreSQL на host.docker.internal:5432.',
      k8sT: 'Kubernetes + Helm',
      k8sP:
        'Для продакшена с TLS, автоскейлингом и управляемой БД. Возможны 2 пути: через deploy.sh в репозиториях или через infra-скрипты (для Yandex Cloud).',
      ctaTitle: 'Готовы попробовать?',
      ctaSub: 'Разверните за минуту локально или зарегистрируйтесь в облаке.',
      ctaStartFree: 'Начать бесплатно',
      footerVersionWord: 'Версия',
      footerDocs: 'Документация',
      footerContact: 'Связаться',
      dockerPreHtml:
        '<span class="comment"># Клонируем репозитории</span>\n<span class="cmd">git clone</span> https://gitverse.ru/ngroznykh/arepos-server.git\n<span class="cmd">git clone</span> https://gitverse.ru/ngroznykh/warchi.git\n\n<span class="comment"># Собираем и запускаем бэкенд (arepos-server)</span>\n<span class="cmd">cd</span> arepos-server\n<span class="cmd">./gradlew</span> bootBuildImage --imageName=arepos-server:local\n<span class="cmd">docker run</span> -d --name arepos-server -p 8080:8080 \\\n  -e DB_URL=jdbc:postgresql://host.docker.internal:5432/arepos \\\n  -e DB_USERNAME=arepos \\\n  -e DB_PASSWORD=arepos \\\n  -e FILE_STORAGE=disabled \\\n  arepos-server:local\n\n<span class="comment"># Собираем и запускаем фронтенд</span>\n<span class="cmd">cd</span> ../warchi\n<span class="cmd">docker build</span> -t warchi \\\n  --build-arg VITE_API_BASE_URL=http://localhost:8080 .\n<span class="cmd">docker run</span> -d -p 80:80 warchi',
      k8sPreHtml:
        '<span class="comment"># Вариант 1: деплой из репозиториев (Helm внутри deploy.sh)</span>\n<span class="cmd">cd</span> arepos-server\n<span class="cmd">./scripts/deploy.sh</span>\n<span class="cmd">cd</span> ../warchi\n<span class="cmd">./scripts/deploy.sh</span>\n\n<span class="comment"># Вариант 2: деплой через infra (Yandex Cloud)</span>\n<span class="comment"># предварительно: cd infra/scripts && ./create-infra.sh</span>\n<span class="cmd">cd</span> infra/scripts\n<span class="cmd">./deploy-arepos-server.sh</span>\n<span class="cmd">./deploy-warchi.sh</span>',
    },
    en: {
      pageTitle: 'wArchi — architecture repository',
      langSwitcherAria: 'Interface language',
      navFeatures: 'Features',
      navPlatform: 'Platform',
      navAudience: 'Who it’s for',
      navFaq: 'FAQ',
      navDocs: 'Documentation',
      navLogin: 'Sign in',
      heroTagSuffix: ' — open source, self-hosted',
      heroTitleHtml:
        'Architectural<br />\n          <span class="accent-word">repository</span><br />\n          for the next generation',
      heroSub:
        'A unified metamodel and ArchiMate / C4 / BPMN / UML notations, server-side SemVer, live model sync, diagram edit locking, link traceability, and batch-save conflict resolution — all in the browser, no file handoffs.',
      ctaTryFree: 'Try for free',
      ctaReadDocs: 'Read the docs',
      visualTitle: 'wArchi — diagram editor',
      imgAlt: 'wArchi interface',
      statNotations: 'Notations',
      statVersioning: 'Versioning',
      statLiveSync: 'Model sync',
      statLicense: 'License',
      featuresLabel: 'Features',
      featuresHeadingHtml: 'Everything for enterprise<br>architecture',
      featuresSub:
        'From modeling to collaboration: live tree and link updates, careful canvas locks, and clear flows when saves conflict.',
      f1t: 'Unified metamodel',
      f1p:
        'Connect business, applications, and technology without duplication. Every element lives once in the model.',
      f2t: 'Collaboration',
      f2p:
        'Multiple people in one model: node and link changes stream in without a full reload. Editing the latest diagram version is protected by a lock.',
      f3t: 'Versioning',
      f3p:
        'Compare model and diagram versions, keep server history with SemVer. On mismatch — field-level diff and choose: pull from server or overwrite.',
      f4t: 'Canvas editor',
      f4p:
        'Diagrams in the browser tied to notation types. The traceability panel shows which links are already on the open diagram; allowed links can be dragged onto the canvas.',
      f5t: 'On-premises',
      f5p: 'Full control: deploy in a private perimeter. Docker, Kubernetes, and a Helm chart out of the box.',
      f6t: 'REST and events',
      f6p:
        'REST and OpenAPI for integrations, JWT auth. For live scenarios — subscribe to model updates via WebSocket/STOMP (client mode is configurable).',
      platformLabel: 'Platform',
      platformHeading: 'How it works',
      platformSub: 'A familiar stack for engineers — standard tooling, open foundations.',
      bentoNotationsT: 'Notations',
      bentoNotationsP: 'Popular frameworks supported. Define your own notations and element types.',
      bentoVersionT: 'Version history',
      bentoVersionP:
        'Every change is recorded. Compare versions, resolve batch-save conflicts field by field, roll back when needed.',
      vtree1: 'Motivation layer added',
      vtree1time: '2 min',
      vtree2: 'Business processes updated',
      vtree2time: '1 h',
      vtree3: 'Initial structure',
      vtree3time: 'yesterday',
      quickstartT: 'Quick start',
      quickstartP: 'Three commands — and the repository is ready.',
      termC1: '# backend on :8080 (PostgreSQL required)',
      termC2: '# frontend on :5173',
      termC3: '# open wArchi',
      termC4: '# Optional: curl -s localhost:8080/api/v1/models | jq',
      audienceLabel: 'Audience',
      audienceHeadingHtml: 'Built for teams<br>that steer architecture',
      audienceSub: 'Enterprise architects, analysts, and platform engineers.',
      aud1role: 'Architect',
      aud1t: 'Architects',
      aud1p:
        'Maintain as-is and target architecture in one model. Use traceability and versions to see dependencies and evolution.',
      aud2role: 'Analyst',
      aud2t: 'Analysts',
      aud2p: 'Tie processes and requirements to architecture elements. Visualize relationships on diagrams.',
      aud3role: 'Platform',
      aud3t: 'CTO and platform teams',
      aud3p: 'Deploy on-premises, integrate via REST API, govern notation standards.',
      faqLabel: 'FAQ',
      faqHeading: 'Common questions',
      faqSub: 'Answers to key questions about the platform.',
      faq1q: 'Can we migrate from Archi?',
      faq1a:
        'Yes — modeling feels familiar, with added web collaboration and server-side versioning. Import models and continue in the browser.',
      faq2q: 'Is there an on-premises option?',
      faq2a:
        'Yes. wArchi deploys in a private perimeter: Docker Compose or Kubernetes. Full control of data and access.',
      faq3q: 'What license?',
      faq3a:
        'AGPL-3.0-or-later for open source. A commercial license is available for corporate use without AGPL constraints.',
      faq4q: 'Which notations are supported?',
      faq4a:
        'ArchiMate 3.2, C4 Model, BPMN 2.0, UML. You can also define custom notations with your own element types.',
      faq5q: 'How does concurrent editing work?',
      faq5a:
        'Model state (nodes, links) can update for everyone via live sync. Editing the latest version of a single diagram is protected by a lock: another user sees the canvas is busy and can view or switch diagrams.',
      deployLabel: 'Self-hosted',
      deployHeading: 'Deployment',
      deploySub: 'Bring up wArchi in your environment in a few commands.',
      dockerT: 'Docker',
      dockerP:
        'Fast start for local development and small teams. Requires reachable PostgreSQL at host.docker.internal:5432.',
      k8sT: 'Kubernetes + Helm',
      k8sP:
        'Production with TLS, autoscaling, and managed databases. Two options are available: deploy.sh in repositories or infra scripts (for Yandex Cloud).',
      ctaTitle: 'Ready to try?',
      ctaSub: 'Spin it up locally in minutes or sign up in the cloud.',
      ctaStartFree: 'Start for free',
      footerVersionWord: 'Version',
      footerDocs: 'Documentation',
      footerContact: 'Contact',
      dockerPreHtml:
        '<span class="comment"># Clone repositories</span>\n<span class="cmd">git clone</span> https://gitverse.ru/ngroznykh/arepos-server.git\n<span class="cmd">git clone</span> https://gitverse.ru/ngroznykh/warchi.git\n\n<span class="comment"># Build and run backend (arepos-server)</span>\n<span class="cmd">cd</span> arepos-server\n<span class="cmd">./gradlew</span> bootBuildImage --imageName=arepos-server:local\n<span class="cmd">docker run</span> -d --name arepos-server -p 8080:8080 \\\n  -e DB_URL=jdbc:postgresql://host.docker.internal:5432/arepos \\\n  -e DB_USERNAME=arepos \\\n  -e DB_PASSWORD=arepos \\\n  -e FILE_STORAGE=disabled \\\n  arepos-server:local\n\n<span class="comment"># Build and run frontend</span>\n<span class="cmd">cd</span> ../warchi\n<span class="cmd">docker build</span> -t warchi \\\n  --build-arg VITE_API_BASE_URL=http://localhost:8080 .\n<span class="cmd">docker run</span> -d -p 80:80 warchi',
      k8sPreHtml:
        '<span class="comment"># Option 1: deploy from repositories (Helm inside deploy.sh)</span>\n<span class="cmd">cd</span> arepos-server\n<span class="cmd">./scripts/deploy.sh</span>\n<span class="cmd">cd</span> ../warchi\n<span class="cmd">./scripts/deploy.sh</span>\n\n<span class="comment"># Option 2: deploy via infra (Yandex Cloud)</span>\n<span class="comment"># first run: cd infra/scripts && ./create-infra.sh</span>\n<span class="cmd">cd</span> infra/scripts\n<span class="cmd">./deploy-arepos-server.sh</span>\n<span class="cmd">./deploy-warchi.sh</span>',
    },
  };

  function getLocale() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.indexOf(s) >= 0) return s;
    } catch (_e) {}
    return 'ru';
  }

  function applyStrings(lang) {
    var T = STRINGS[lang] || STRINGS.ru;
    document.title = T.pageTitle;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key && T[key] !== undefined) {
        el.textContent = T[key];
      }
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (key && T[key] !== undefined) {
        el.innerHTML = T[key];
      }
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-alt');
      if (key && T[key] !== undefined) {
        el.setAttribute('alt', T[key]);
      }
    });

    var dockerPre = document.getElementById('deploy-docker-pre');
    if (dockerPre && T.dockerPreHtml) {
      dockerPre.innerHTML = T.dockerPreHtml;
    }
    var k8sPre = document.getElementById('deploy-k8s-pre');
    if (k8sPre && T.k8sPreHtml) {
      k8sPre.innerHTML = T.k8sPreHtml;
    }

    var t1 = document.getElementById('term-comment-1');
    var t2 = document.getElementById('term-comment-2');
    var t3 = document.getElementById('term-comment-3');
    var t4 = document.getElementById('term-comment-4');
    var langSwitch = document.getElementById('landing-lang-switch');
    if (langSwitch && T.langSwitcherAria) {
      langSwitch.setAttribute('aria-label', T.langSwitcherAria);
    }
    if (t1 && T.termC1) {
      t1.textContent = T.termC1;
    }
    if (t2 && T.termC2) {
      t2.textContent = T.termC2;
    }
    if (t3 && T.termC3) {
      t3.textContent = T.termC3;
    }
    if (t4 && T.termC4) {
      t4.textContent = T.termC4;
    }
  }

  function setHtmlLang(lang) {
    document.documentElement.lang = lang === 'en' ? 'en' : 'ru';
  }

  function updateSwitcher(active) {
    document.querySelectorAll('[data-landing-lang]').forEach(function (btn) {
      var l = btn.getAttribute('data-landing-lang');
      var isActive = l === active;
      btn.classList.toggle('lang-switch__btn--active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setLocale(lang) {
    if (SUPPORTED.indexOf(lang) < 0) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_e) {}
    setHtmlLang(lang);
    applyStrings(lang);
    updateSwitcher(lang);
  }

  window.initLandingI18n = function initLandingI18n() {
    var start = getLocale();
    setHtmlLang(start);
    applyStrings(start);
    updateSwitcher(start);

    document.querySelectorAll('[data-landing-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-landing-lang');
        if (lang) {
          setLocale(lang);
        }
      });
    });
  };
})();
