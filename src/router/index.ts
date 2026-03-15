import { createRouter, createWebHistory } from "vue-router";
import { useAuth } from "../composables/useAuth";
import "./types";

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
      path: "/admin",
      component: () => import("../layouts/AdminLayout.vue"),
      meta: { requiresRole: "ADMIN" },
      children: [
        {
          path: "",
          redirect: { name: "admin-users" }
        },
        {
          path: "users",
          name: "admin-users",
          component: () => import("../views/AdminUsersView.vue")
        },
        {
          path: "deleted",
          name: "admin-deleted",
          component: () => import("../views/AdminDeletedView.vue")
        }
      ]
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
      path: "/models/:id/compare",
      name: "model-visual-compare",
      component: () => import("../views/ModelVisualCompareView.vue")
    },
    {
      path: "/models/:id/diagram-compare",
      name: "diagram-versions-compare",
      component: () => import("../views/DiagramVersionsCompareView.vue")
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
      path: "/shapes",
      name: "shapes",
      component: () => import("../views/ShapesView.vue")
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
      path: "/wiki",
      name: "wiki",
      component: () => import("../views/WikiView.vue")
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

  if (to.meta.requiresRole && currentUser.value?.role !== to.meta.requiresRole) {
    return { name: "home" };
  }

  return true;
});

export default router;
