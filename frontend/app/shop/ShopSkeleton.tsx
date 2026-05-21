export function ShopSidebarSkeleton() {
  return (
    <div className="csp-skeleton-sidebar" aria-hidden="true">
      <div className="csp-skeleton-sidebar-head">
        <span className="csp-skeleton-line csp-skeleton-line-sm" />
        <span className="csp-skeleton-line csp-skeleton-line-xs" />
      </div>
      {[0, 1, 2, 3, 4].map(item => (
        <div className="csp-skeleton-filter" key={item}>
          <span className="csp-skeleton-line" />
          <span className="csp-skeleton-dot" />
        </div>
      ))}
    </div>
  );
}

export function ShopGridSkeleton({ listMode = false }: { listMode?: boolean }) {
  return (
    <div
      className={`csp-grid csp-skeleton-grid${listMode ? ' list-mode' : ''}`}
      role="status"
      aria-label="Loading products"
    >
      {Array.from({ length: listMode ? 5 : 10 }).map((_, index) => (
        <article className="csp-card csp-skeleton-card" key={index} aria-hidden="true">
          <div className="csp-img-wrap csp-skeleton-img" />
          <div className="csp-info csp-skeleton-info">
            <span className="csp-skeleton-line csp-skeleton-title" />
            <span className="csp-skeleton-line csp-skeleton-title-short" />
            <div className="csp-skeleton-price-row">
              <span className="csp-skeleton-line csp-skeleton-price" />
              <span className="csp-skeleton-line csp-skeleton-badge" />
            </div>
            {listMode && (
              <>
                <span className="csp-skeleton-line csp-skeleton-desc" />
                <span className="csp-skeleton-line csp-skeleton-desc-short" />
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
