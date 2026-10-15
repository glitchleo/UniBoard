import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Check, GraduationCap, Menu, Plus, Search, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Avatar } from './components/Avatar';
import { CampusAside } from './components/CampusAside';
import AccountDialog from './components/AccountDialog';
import ApiAccountDialog from './components/ApiAccountDialog';
import Composer from './components/Composer';
import PostDetail from './components/PostDetail';
import { ReportDialog } from './components/ReportDialog';
import { BoardPage } from './pages/BoardPage';
import { ClubsPage, GuidePage, ModerationPage, NotificationsPage } from './pages/CommunityPages';
import { useBoard } from './features/board/useBoard';
import { useApiBoard } from './features/board/useApiBoard';
import { LiveModerationPage } from './pages/LiveModerationPage';
import type { Filters } from './features/board/selectors';
import type { Post } from './types';

const initialFilters: Filters = {
  query: '',
  type: 'All posts',
  faculty: 'All faculties',
  tag: '',
  days: 0,
};
const API_MODE = import.meta.env.VITE_DATA_MODE === 'api';
const pageNames: Record<string, string> = {
  '/': 'Campus feed',
  '/saved': 'Saved posts',
  '/dashboard': 'My dashboard',
  '/clubs': 'Clubs & communities',
  '/notifications': 'Notifications',
  '/moderation': 'Moderation demo',
  '/guide': 'Project guide',
};

function CampusApp() {
  const demoBoard = useBoard(!API_MODE);
  const apiBoard = useApiBoard(API_MODE);
  const board = API_MODE ? apiBoard : demoBoard;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const page = pageNames[pathname] ? pathname : '/';
  const [filters, setFilters] = useState(initialFilters);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [account, setAccount] = useState<'profile' | 'university' | 'signin' | null>(null);
  const [composer, setComposer] = useState<{ post?: Post } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    kind: 'post' | 'comment' | 'user';
    id: string;
    title: string;
  } | null>(null);
  const selected = board.posts.find((post) => post.id === selectedId);
  const reported = reportTarget;
  useEffect(() => {
    setFilters(initialFilters);
    setSelectedId(null);
    setComposer(null);
    setReportTarget(null);
  }, [board.profile.university, board.signedIn]);
  const unreadCount = board.notifications.filter((n) => !n.read).length;
  const closeAccount = useCallback(() => setAccount(null), []);
  const closeComposer = useCallback(() => setComposer(null), []);
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const guarded = (action: () => void) => {
    if (board.signedIn) action();
    else setAccount('signin');
  };
  const createPost = () =>
    guarded(() => {
      if (API_MODE && apiBoard.membership?.status !== 'approved') setAccount('university');
      else setComposer({});
    });
  const openPost = async (id: string) => {
    if (API_MODE) {
      if (await apiBoard.loadPost(id)) setSelectedId(id);
      return;
    }
    if (board.posts.some((post) => post.id === id)) setSelectedId(id);
    else board.notify('This post is no longer available on your campus.');
  };
  const filter = (next: Partial<Filters>) => setFilters((previous) => ({ ...previous, ...next }));
  const tag = (value: string) => {
    setFilters({ ...initialFilters, tag: value });
    navigate('/');
  };
  const visiblePosts =
    page === '/saved'
      ? board.posts.filter((post) => board.savedIds.includes(post.id))
      : page === '/dashboard'
        ? board.posts.filter((post) => post.authorId === board.profile.id)
        : board.posts;
  const hasFeed = ['/', '/saved', '/dashboard'].includes(page);
  const protectedPage = !board.signedIn && !['/', '/clubs', '/guide'].includes(page);
  const boardProps = {
    posts: visiblePosts,
    filters,
    onFilter: filter,
    savedIds: board.savedIds,
    likedIds: board.likedIds,
    onOpen: openPost,
    onSave: (id: string) => guarded(() => board.toggleSaved(id)),
    onLike: (id: string) => guarded(() => board.toggleLiked(id)),
    onCreate: createPost,
    apiMode: API_MODE,
    facultyOptions: API_MODE ? apiBoard.faculties.map((faculty) => faculty.name) : undefined,
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        profile={board.profile}
        signedIn={board.signedIn}
        savedCount={board.posts.filter((p) => board.savedIds.includes(p.id)).length}
        unreadCount={unreadCount}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onAccount={() => setAccount(board.signedIn ? 'profile' : 'signin')}
        onUniversity={() => setAccount(board.signedIn ? 'university' : 'signin')}
        apiMode={API_MODE}
        role={apiBoard.role}
      />
      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>
          <Link to="/" className="portal-title" aria-label="UniBoard campus home">
            <GraduationCap size={23} />
            <span>
              {board.profile.university === 'Choose your university'
                ? 'UniBoard'
                : board.profile.university}
            </span>
          </Link>
          <label className="global-search">
            <Search size={16} />
            <span className="sr-only">Search campus posts</span>
            <input
              type="search"
              placeholder="Search your campus…"
              value={filters.query}
              onChange={(event) => {
                filter({ query: event.target.value });
                if (!hasFeed) navigate('/');
              }}
            />
            <kbd>⌕</kbd>
          </label>
          <span className="preview-badge">
            <span />
            {API_MODE ? 'API MODE' : 'BROWSER DEMO'}
          </span>
          <Link
            to="/notifications"
            className="icon-button header-bell"
            aria-label={`Notifications, ${unreadCount} unread`}
          >
            <Bell size={19} />
            {unreadCount > 0 && <span />}
          </Link>
          <button
            className="button primary create-post"
            aria-label="Create post"
            onClick={createPost}
          >
            <Plus size={16} />
            <span>Create post</span>
          </button>
          <button
            className="topbar-avatar"
            aria-label="Open your profile"
            onClick={() => setAccount(board.signedIn ? 'profile' : 'signin')}
          >
            <Avatar value={board.profile.avatar} name={board.profile.name} />
          </button>
        </header>
        {board.storageError && (
          <div className="storage-warning" role="alert">
            Browser storage is unavailable or full. Your changes will last for this visit only.
          </div>
        )}
        <div className={`content-layout ${!hasFeed ? 'wide-layout' : ''}`}>
          <main id="main-content" className="main-content" tabIndex={-1}>
            {API_MODE && apiBoard.loading && (
              <div className="inline-note" role="status">
                Loading your campus…
              </div>
            )}
            {API_MODE && apiBoard.error && (
              <div className="inline-note" role="alert">
                <p>{apiBoard.error}</p>
                <button
                  className="button secondary"
                  onClick={() => void apiBoard.refresh().catch(() => {})}
                >
                  Try again
                </button>
              </div>
            )}
            {API_MODE &&
              !apiBoard.loading &&
              !apiBoard.error &&
              (!board.signedIn || apiBoard.membership?.status !== 'approved') &&
              page !== '/guide' && (
                <div className="inline-note">
                  <p>
                    {!board.signedIn
                      ? 'Sign in to discover your university community.'
                      : apiBoard.membership
                        ? `Your campus membership is ${apiBoard.membership.status}. Review your membership details to continue.`
                        : 'Choose your university and verify membership to join the conversation.'}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setAccount(board.signedIn ? 'university' : 'signin')}
                  >
                    {board.signedIn ? 'My university' : 'Sign in'}
                  </button>
                </div>
              )}
            {API_MODE && apiBoard.feedLimited && hasFeed && (
              <p className="preview-note">
                Showing the latest 100 posts and your saved posts. Filters apply to this loaded set.
                The API supports paginated search for the full archive.
              </p>
            )}
            {page === '/' && <BoardPage {...boardProps} showFeature={!API_MODE} />}
            {protectedPage && (
              <div className="empty-state">
                <h2>Your little corner is waiting.</h2>
                <p>
                  Sign in to the browser preview to explore your posts, saved items, and activity.
                </p>
                <button className="button primary" onClick={() => setAccount('signin')}>
                  Sign in to preview
                </button>
              </div>
            )}
            {page === '/saved' && !protectedPage && (
              <BoardPage
                {...boardProps}
                heading="Saved posts"
                description="Posts you have bookmarked for later."
              />
            )}
            {page === '/dashboard' && !protectedPage && (
              <>
                <div className="dashboard-stats">
                  <div>
                    <span>YOUR POSTS</span>
                    <strong>{visiblePosts.length}</strong>
                  </div>
                  <div>
                    <span>SAVED FOR LATER</span>
                    <strong>
                      {board.posts.filter((p) => board.savedIds.includes(p.id)).length}
                    </strong>
                  </div>
                  <div>
                    <span>POST COMMENTS</span>
                    <strong>
                      {visiblePosts.reduce(
                        (count, p) => count + (p.commentCount ?? p.comments.length),
                        0,
                      )}
                    </strong>
                  </div>
                </div>
                <BoardPage
                  {...boardProps}
                  heading="My dashboard"
                  description="Manage your posts and activity. Open Create post to continue a saved draft."
                />
              </>
            )}
            {page === '/clubs' && (
              <ClubsPage
                university={board.profile.university}
                apiClubs={API_MODE ? apiBoard.clubs : undefined}
              />
            )}
            {page === '/notifications' && !protectedPage && (
              <NotificationsPage board={board} onOpen={openPost} apiMode={API_MODE} />
            )}
            {page === '/moderation' &&
              !protectedPage &&
              (API_MODE ? (
                <LiveModerationPage
                  universityId={apiBoard.activeUniversityId}
                  role={apiBoard.role}
                  onOpen={openPost}
                  onNotify={board.notify}
                  onRefresh={async () => {
                    await apiBoard.refresh();
                  }}
                />
              ) : (
                <ModerationPage board={demoBoard} onOpen={openPost} />
              ))}
            {page === '/guide' && <GuidePage apiMode={API_MODE} />}
          </main>
          {hasFeed && (
            <CampusAside
              apiMode={API_MODE}
              posts={board.posts}
              onOpen={openPost}
              onTag={tag}
              onCreate={createPost}
            />
          )}
        </div>
      </div>
      {account &&
        (API_MODE ? (
          <ApiAccountDialog key={account} mode={account} board={apiBoard} onClose={closeAccount} />
        ) : (
          <AccountDialog
            key={account}
            mode={account}
            profile={board.profile}
            onClose={closeAccount}
            onUpdate={(profile) => {
              demoBoard.updateProfile(profile, account === 'signin');
              setSelectedId(null);
              setFilters(initialFilters);
            }}
            onSignOut={() => {
              board.signOut();
              setAccount(null);
            }}
            onNotify={board.notify}
          />
        ))}
      {composer && (
        <Composer
          profile={board.profile}
          post={composer.post}
          faculties={API_MODE ? apiBoard.faculties.map((f) => f.name) : undefined}
          apiMode={API_MODE}
          onClose={closeComposer}
          onPublish={async (post) => {
            const result = await board.publish(post);
            if (result === false) return false;
            setComposer(null);
            setFilters(initialFilters);
            navigate('/');
            return true;
          }}
        />
      )}
      {selected && !composer && !reported && !account && (
        <PostDetail
          post={selected}
          profile={board.profile}
          signedIn={board.signedIn}
          apiMode={API_MODE}
          onVote={API_MODE ? (option) => apiBoard.votePost(selected.id, option) : undefined}
          votedOption={API_MODE ? (apiBoard.ownVotes[selected.id] ?? null) : undefined}
          saved={board.savedIds.includes(selected.id)}
          liked={board.likedIds.includes(selected.id)}
          onLike={() => guarded(() => board.toggleLiked(selected.id))}
          onClose={closeDetail}
          onSave={() => guarded(() => board.toggleSaved(selected.id))}
          onUpdate={board.updatePost}
          onEdit={() => guarded(() => setComposer({ post: selected }))}
          onDelete={async () => {
            if ((await board.remove(selected.id)) !== false) setSelectedId(null);
          }}
          onReport={() =>
            guarded(() => setReportTarget({ kind: 'post', id: selected.id, title: selected.title }))
          }
          onReportComment={(comment) =>
            guarded(() =>
              setReportTarget({
                kind: 'comment',
                id: comment.id,
                title: `Comment by ${comment.author}`,
              }),
            )
          }
          onReportUser={(userId) =>
            guarded(() => setReportTarget({ kind: 'user', id: userId, title: 'Campus member' }))
          }
        />
      )}
      {reported && (
        <ReportDialog
          title={reported.title}
          apiMode={API_MODE}
          onClose={() => setReportTarget(null)}
          onSubmit={async (reason) => {
            const result = API_MODE
              ? reported.kind === 'comment'
                ? await apiBoard.reportComment(reported.id, reason)
                : reported.kind === 'user'
                  ? await apiBoard.reportUser(reported.id, reason)
                  : await apiBoard.report(reported.id, reason)
              : demoBoard.report(
                  selectedId ?? reported.id,
                  `${reported.kind === 'post' ? '' : `${reported.title}: `}${reason}`,
                );
            if (result !== false) {
              setReportTarget(null);
              return true;
            }
            return false;
          }}
        />
      )}
      {board.toast && (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          <p>{board.toast}</p>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => board.notify('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CampusApp />
    </BrowserRouter>
  );
}
