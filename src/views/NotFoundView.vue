<template>
  <section class="content-card empty-state">
    <span class="eyebrow">404</span>
    <h2>页面不存在</h2>
    <p>当前地址无对应页面，请从左侧导航选择功能。</p>
    <router-link to="/overview">返回运行概览</router-link>
  </section>
</template>

<style scoped>
.empty-state {
  min-height: 320px;
  display: grid;
  place-content: center;
  gap: 12px;
  text-align: center;
}

.empty-state h2,
.empty-state p {
  margin: 0;
}

.empty-state a {
  color: #f47a12;
}
</style>
