import { createRouter, createWebHistory } from "vue-router";
import { useAuth } from "../composables/useAuth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { requiresAuth: false }
    },
    {
      path: "/models",
      name: "models",
      component: () => import("../views/ModelsView.vue"),
    },
    {
      path: "/models/:id",
      name: "model-editor",
      component: () => import("../features/models/ModelEditor.vue")
    },
    {
      path: "/notations",
      name: "notations",
      component: () => import("../views/NotationsView.vue")
    },
    {
      path: "/types",
      name: "types",
      component: () => import("../views/TypesView.vue")
    },
    {
      path: "/notations/:id",
      name: "notation-editor",
      component: () => import("../views/NotationEditorView.vue")
    },
    {
      path: "/",
      name: "home",
      component: () => import("../views/HomeView.vue"),
    }
  ]
});

router.beforeEach((to) => {
  const { isAuthenticated } = useAuth();

  if (to.meta.requiresAuth === false) {
    return true;
  }

  if (!isAuthenticated.value) {
    return { name: "login" };
  }

  return true;
});

export default router;
