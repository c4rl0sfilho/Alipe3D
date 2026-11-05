/* eslint-disable react-refresh/only-export-components -- arquivo de rotas: declara páginas sob demanda e exporta o roteador */
import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, Outlet } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { GuestOnly, RequireAuth, RequirePermission, RequireSession } from '@/layouts/guards';
import { LoginPage } from '@/modules/auth/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** Carrega a página sob demanda (um arquivo JS por tela). */
function page<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(async () => ({ default: (await loader())[name] }));
}

const ForgotPasswordPage = page(
  () => import('@/modules/auth/ForgotPasswordPage'),
  'ForgotPasswordPage',
);
const ResetPasswordPage = page(
  () => import('@/modules/auth/ResetPasswordPage'),
  'ResetPasswordPage',
);
const FirstAccessPage = page(() => import('@/modules/auth/FirstAccessPage'), 'FirstAccessPage');
const HomePage = page(() => import('@/modules/home/HomePage'), 'HomePage');
const UsersPage = page(() => import('@/modules/users/UsersPage'), 'UsersPage');
const RolesPage = page(() => import('@/modules/roles/RolesPage'), 'RolesPage');
const AuditPage = page(() => import('@/modules/audit/AuditPage'), 'AuditPage');
const ProfilePage = page(() => import('@/modules/profile/ProfilePage'), 'ProfilePage');
const ProductsPage = page(() => import('@/modules/products/ProductsPage'), 'ProductsPage');
const ProductDetailPage = page(
  () => import('@/modules/products/ProductDetailPage'),
  'ProductDetailPage',
);
const CategoriesPage = page(() => import('@/modules/products/CategoriesPage'), 'CategoriesPage');
const InventoryLayout = page(
  () => import('@/modules/inventory/InventoryLayout'),
  'InventoryLayout',
);
const InventoryOverviewPage = page(
  () => import('@/modules/inventory/InventoryOverviewPage'),
  'InventoryOverviewPage',
);
const MaterialsPage = page(() => import('@/modules/inventory/MaterialsPage'), 'MaterialsPage');
const RollsPage = page(() => import('@/modules/inventory/RollsPage'), 'RollsPage');
const StockItemsPage = lazy(async () => ({
  default: (await import('@/modules/inventory/StockItemsPage')).StockItemsPage,
}));
const MovementsPage = page(() => import('@/modules/inventory/MovementsPage'), 'MovementsPage');
const SuppliersPage = page(() => import('@/modules/inventory/SuppliersPage'), 'SuppliersPage');
const ProductionLayout = page(
  () => import('@/modules/production/ProductionLayout'),
  'ProductionLayout',
);
const OrdersListPage = lazy(async () => ({
  default: (await import('@/modules/production/OrdersListPage')).OrdersListPage,
}));
const PrintJobsPage = page(() => import('@/modules/production/PrintJobsPage'), 'PrintJobsPage');
const ProductionOrderDetailPage = page(
  () => import('@/modules/production/ProductionOrderDetailPage'),
  'ProductionOrderDetailPage',
);
const PrintersPage = page(() => import('@/modules/printers/PrintersPage'), 'PrintersPage');
const PrinterDetailPage = page(
  () => import('@/modules/printers/PrinterDetailPage'),
  'PrinterDetailPage',
);
const SystemStatusPage = page(
  () => import('@/modules/system/SystemStatusPage'),
  'SystemStatusPage',
);

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/esqueci-senha', element: <ForgotPasswordPage /> },
    ],
  },
  // Acessível com ou sem sessão (o link chega por e-mail)
  { path: '/redefinir-senha', element: <ResetPasswordPage /> },
  {
    element: <RequireSession />,
    children: [{ path: '/definir-senha', element: <FirstAccessPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            path: '/produtos',
            element: (
              <RequirePermission permission="products:read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <ProductsPage /> },
              { path: 'categorias', element: <CategoriesPage /> },
              { path: ':id', element: <ProductDetailPage /> },
            ],
          },
          {
            path: '/estoque',
            element: (
              <RequirePermission permission="inventory:read">
                <InventoryLayout />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <InventoryOverviewPage /> },
              { path: 'filamentos', element: <MaterialsPage /> },
              { path: 'rolos', element: <RollsPage /> },
              { path: 'insumos', element: <StockItemsPage kind="SUPPLY" /> },
              { path: 'produtos-acabados', element: <StockItemsPage kind="FINISHED_GOOD" /> },
              { path: 'movimentacoes', element: <MovementsPage /> },
              { path: 'fornecedores', element: <SuppliersPage /> },
            ],
          },
          {
            path: '/producao',
            element: (
              <RequirePermission permission="production:read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              {
                element: <ProductionLayout />,
                children: [
                  { index: true, element: <OrdersListPage key="queue" view="queue" /> },
                  {
                    path: 'inspecao',
                    element: <OrdersListPage key="inspection" view="inspection" />,
                  },
                  { path: 'ordens', element: <OrdersListPage key="all" view="all" /> },
                  { path: 'impressoes', element: <PrintJobsPage /> },
                ],
              },
              { path: 'ordens/:id', element: <ProductionOrderDetailPage /> },
            ],
          },
          {
            path: '/impressoras',
            element: (
              <RequirePermission permission="printers:read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <PrintersPage /> },
              { path: ':id', element: <PrinterDetailPage /> },
            ],
          },
          {
            path: '/usuarios',
            element: (
              <RequirePermission permission="users:read">
                <UsersPage />
              </RequirePermission>
            ),
          },
          {
            path: '/perfis',
            element: (
              <RequirePermission permission="roles:manage">
                <RolesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/auditoria',
            element: (
              <RequirePermission permission="audit:read">
                <AuditPage />
              </RequirePermission>
            ),
          },
          { path: '/perfil', element: <ProfilePage /> },
          { path: '/status', element: <SystemStatusPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
