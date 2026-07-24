<template>
  <footer>
    <div class="copyright">
      <n-text class="description">
        Copyright &copy;
        <span v-if="startYear < fullYear">{{ startYear }} - </span>{{ fullYear }}
        <a class="author-link" href="https://home.dailecheng.xyz" target="_blank">dyf</a>
        &amp; Made by dyf
      </n-text>
    </div>
    <n-text v-if="icp" :depth="3" class="icp">
      <a class="author-link" href="https://beian.miit.gov.cn/" target="_blank">{{ icp }}</a>
    </n-text>
  </footer>
</template>

<script setup>
const fullYear = new Date().getFullYear();
const startYear = 2026;
const icp = ref(import.meta.env.VITE_ICP ? import.meta.env.VITE_ICP : null);
</script>

<style lang="scss" scoped>
footer {
  height: 100px;
  padding: 0 5vw;
  max-width: 1800px;
  margin: 20px auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  .copyright {
    margin-bottom: 4px;
  }
  .author-link {
    color: inherit;
    text-decoration: none;
    transition: all 0.3s;
    &:hover {
      color: var(--n-code-text-color);
    }
  }
  .icp {
    font-size: 13px;
    cursor: pointer;
    transition: all 0.3s;
    &:hover {
      color: var(--n-code-text-color);
    }
  }
}
</style>
