import { NavLink } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  Bookmark,
  BookOpen,
  ChevronDown,
  LayoutGrid,
  MessageSquareText,
  MoreHorizontal,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { Profile } from '../types';
import { Avatar } from './Avatar';

interface Props {
  profile: Profile;
  signedIn: boolean;
  savedCount: number;
  unreadCount: number;
  open: boolean;
  onClose: () => void;
  onAccount: () => void;
  onUniversity: () => void;
  apiMode?: boolean;
  role?: string | null;
}

export function Sidebar({
  profile,
  signedIn,
  savedCount,
  unreadCount,
  open,
  onClose,
  onAccount,
  onUniversity,
  apiMode = false,
  role,
}: Props) {
  return (
    <>
      {open && <button className="sidebar-shade" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="brand-row">
          <NavLink to="/" className="brand" onClick={onClose}>
            UniBoard
          </NavLink>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <button className="profile-button" onClick={onAccount}>
          <Avatar value={profile.avatar} name={profile.name} />
          <span>
            <strong>{signedIn ? profile.name : 'Welcome to UniBoard'}</strong>
            <small>
              {signedIn
                ? apiMode
                  ? `${role === 'moderator' ? 'Moderator' : role === 'admin' ? 'University admin' : 'Student'} · my account`
                  : 'Student · browser demo'
                : apiMode
                  ? 'Sign in to your account'
                  : 'Sign in to the preview'}
            </small>
          </span>
          <MoreHorizontal size={17} />
        </button>
        <button className="campus-switch" onClick={onUniversity}>
          <span className="campus-mark">
            {profile.university === 'University of Tirana'
              ? 'UT'
              : profile.university
                  .split(' ')
                  .map((word) => word[0])
                  .slice(0, 3)
                  .join('')}
          </span>
          <span>
            <small>University</small>
            <strong>{profile.university}</strong>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="nav-label">Navigation</span>
        <nav aria-label="Main navigation">
          <NavLink to="/" end onClick={onClose}>
            <LayoutGrid size={18} />
            <span>Campus feed</span>
          </NavLink>
          <NavLink to="/clubs" onClick={onClose}>
            <Users size={18} />
            <span>Clubs & communities</span>
          </NavLink>
          <NavLink to="/saved" onClick={onClose}>
            <Bookmark size={18} />
            <span>Saved posts</span>
            {savedCount > 0 && <span className="nav-count">{savedCount}</span>}
          </NavLink>
        </nav>
        <span className="nav-label second-label">My account</span>
        <nav aria-label="Personal navigation">
          <NavLink to="/dashboard" onClick={onClose}>
            <MessageSquareText size={18} />
            <span>My dashboard</span>
          </NavLink>
          <NavLink to="/notifications" onClick={onClose}>
            <Bell size={18} />
            <span>Notifications</span>
            {unreadCount > 0 && <span className="nav-count notification-count">{unreadCount}</span>}
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <NavLink className="utility-link" to="/guide" onClick={onClose}>
            <BookOpen size={15} />
            Project guide
            <ArrowUpRight size={13} />
          </NavLink>
          {(!apiMode || role === 'moderator' || role === 'admin') && (
            <NavLink className="utility-link" to="/moderation" onClick={onClose}>
              <ShieldCheck size={15} />
              {apiMode ? 'Moderation' : 'Moderation demo'}
              {!apiMode && <span className="tiny-label">LOCAL</span>}
            </NavLink>
          )}
        </div>
      </aside>
    </>
  );
}
