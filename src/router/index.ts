import { createRouter, createWebHistory } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { canViewAdminPanel } from "../composables/usePermissions";
import { resolveLoginRedirect } from "./resolveLoginRedirect";
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
      meta: { requiresAdminPanel: true },
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
        },
        {
          path: "diagram-locks",
          name: "admin-diagram-locks",
          component: () => import("../views/AdminDiagramLocksView.vue")
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
      path: "/models/:id/relation-matrix",
      name: "model-relation-matrix",
      component: () => import("../views/ModelRelationMatrixView.vue")
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
      component: () => import("../features/notations/NotationEditorPage.vue")
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
      name: "root",
      redirect: () => {
        const { isAuthenticated } = useAuth()
        if (isAuthenticated.value) {
          return { name: "home" }
        }
        const siteUrl = (import.meta.env.VITE_SITE_URL || "").trim()
        if (siteUrl) {
          window.location.replace(siteUrl)
          return { name: "home" }
        }
        return { name: "home" }
      },
      meta: { requiresAuth: false }
    },
    {
      path: "/landing",
      redirect: "/"
    },
    {
      path: "/wiki",
      name: "wiki",
      component: () => import("../views/WikiView.vue")
    },
    {
      path: "/home",
      name: "home",
      component: () => import("../views/HomeView.vue")
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      redirect: { name: "home" }
    }
  ]
});

router.beforeEach(async (to) => {
  const { isAuthenticated, currentUser, loadCurrentUser } = useAuth();

  if (to.meta.requiresAuth === false) {
    if (to.name === "login") {
      const returnUrl =
        typeof to.query.returnUrl === "string" ? to.query.returnUrl : null;
      const decision = await resolveLoginRedirect({
        isAuthenticated: isAuthenticated.value,
        returnUrl,
        loadCurrentUser,
        isStillAuthenticated: () => isAuthenticated.value
      });
      if (decision.type === "return") {
        window.location.replace(decision.url);
        return false;
      }
      if (decision.type === "home") {
        return { name: "home" };
      }
      return true;
    }
    return true;
  }

  if (!isAuthenticated.value) {
    return { name: "login" };
  }

  if (to.meta.requiresAdminPanel === true) {
    const currentUserId = currentUser.value?.id;
    if (!currentUserId) {
      return { name: "home" };
    }

    const allowed = await canViewAdminPanel(currentUserId);
    if (!allowed) {
      return { name: "home" };
    }
  }

  return true;
});

export default router;
