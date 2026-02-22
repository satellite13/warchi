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
      path: "/admin/users",
      name: "admin-users",
      component: () => import("../views/AdminUsersView.vue"),
      meta: { requiresRole: "ADMIN" }
    },
    {
      path: "/profile",
      name: "profile",
      component: () => import("../views/UserProfileView.vue")
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
      path: "/docs",
      redirect: "/docs/overview"
    },
    {
      path: "/docs/:section",
      name: "docs-section",
      component: () => import("../views/DocsView.vue")
    },
    {
      path: "/",
      name: "home",
      component: () => import("../views/HomeView.vue"),
    }
  ]
});

router.beforeEach((to) => {
  const { isAuthenticated, currentUser } = useAuth();

  if (to.meta.requiresAuth === false) {
    if (to.name === "login" && isAuthenticated.value) {
      return { name: "home" };
    }
    return true;
  }

  if (!isAuthenticated.value) {
    return { name: "login" };
  }

  const requiredRole =
    typeof to.meta.requiresRole === "string" ? to.meta.requiresRole : undefined;
  if (requiredRole && currentUser.value?.role !== requiredRole) {
    return { name: "home" };
  }

  return true;
});

export default router;
