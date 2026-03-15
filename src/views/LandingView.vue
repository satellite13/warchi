<script setup lang="ts">
import landingHtml from '../../pencil/landing.html?raw'

const FALLBACK_SCREENSHOT = '/landing-screenshot.png'
const LANDING_SCREENSHOT_NAME = 'Снимок экрана 2026-03-13 в 22.27.48.png'

const html = landingHtml.replace(
  `src="${LANDING_SCREENSHOT_NAME}"`,
  `src="${FALLBACK_SCREENSHOT}"`
)
</script>

<template>
  <iframe
    class="landing-frame"
    :srcdoc="html"
    title="wArchi landing"
  />
</template>

<style scoped>
.landing-frame {
  width: 100%;
  height: 100vh;
  border: 0;
  display: block;
  background: #fff;
}
</style>
