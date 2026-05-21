'use client';

import Link from 'next/link';

type AccountSidebarProps = {
  accountHandle: string;
  activeLink?: 'dashboard' | 'edit-account' | 'edit-address' | 'orders' | 'order-tracking' | 'wishlist';
  onLogout: () => void;
};

export default function AccountSidebar({ accountHandle, activeLink, onLogout }: AccountSidebarProps) {
  return (
    <aside className="account-sidebar">
      <div className="account-sidebar-inner">
        <div className="account-avatar" aria-hidden="true">
          <i className="fa-regular fa-user"></i>
        </div>
        <h3 className="account-hello">Hello</h3>
        <p className="account-handle">{accountHandle}</p>

        <nav className="account-nav" aria-label="Account navigation">
          <Link href="/my-account" className={`account-nav-link${activeLink === 'dashboard' ? ' active' : ''}`}>Dashboard</Link>
          <Link href="/my-account/edit-account" className={`account-nav-link${activeLink === 'edit-account' ? ' active' : ''}`}>Edit Profile</Link>
          <Link href="/my-account/edit-address" className={`account-nav-link${activeLink === 'edit-address' ? ' active' : ''}`}>My Addresses</Link>
          <Link href="/orders" className={`account-nav-link${activeLink === 'orders' ? ' active' : ''}`}>My Orders</Link>
          <Link href="/wishlist" className={`account-nav-link${activeLink === 'wishlist' ? ' active' : ''}`}>Wishlist</Link>
          <button className="account-nav-button" onClick={onLogout}>Logout</button>
        </nav>
      </div>
    </aside>
  );
}
