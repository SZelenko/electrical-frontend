<script setup lang="ts">
import RailWidthField from './RailWidthField.vue'
</script>

<template>
  <section aria-label="Властивості щита">
    <h3>Щит</h3>
    <RailWidthField />
    <p class="hint">
      Ширина однакова для всіх рейок. Рядок клемників починається після вхідних кабелів і триває до
      краю рейок.
    </p>
    <p class="hint">Виберіть рейку, апарат, шину, клемний блок, кабель або провід на схемі.</p>
  </section>
</template>
