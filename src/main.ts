import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElConfigProvider,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElLoading,
  ElOption,
  ElPagination,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { router } from './router'
import './styles.css'

const savedTheme = localStorage.getItem('finance-theme')
document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light'

const app = createApp(App).use(createPinia()).use(router)

const components = [
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElConfigProvider,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElPagination,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
]

components.forEach((component) => app.use(component))
app.directive('loading', ElLoading.directive)
app.mount('#app')
