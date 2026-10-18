import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  Layers3, 
  CheckCircle2, 
  ClipboardList, 
  Gauge, 
  FileText, 
  FileQuestion, 
  Film, 
  BookOpen, 
  Heart, 
  PlusCircle, 
  Clock, 
  ArrowRight,
  Database,
  ShieldCheck
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Header } from "../components/Header";
import { ApiBanner } from "../components/ApiBanner";

export const Dashboard: React.FC = () => {
  const { items, apiSource, authSession } = useAppContext();

  const counts = useMemo(() => {
    return {
      total: items.length,
      published: items.filter((i) => i.status === "published").length,
      drafts: items.filter((i) => i.status === "draft").length,
      review: items.filter((i) => i.status === "review").length,
      blogs: items.filter((i) => i.type === "blog").length,
      qas: items.filter((i) => i.type === "qa").length,
      videos: items.filter((i) => i.type === "video").length,
      guides: items.filter((i) => i.type === "guide" || i.type === "tip").length,
      conditions: items.filter((i) => i.type === "issue").length,
    };
  }, [items]);

  const recentItems = useMemo(() => {
    return [...items]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [items]);

  return (
    <div className="workspace-page">
      <Header 
        title="Content Overview" 
        subtitle="Manage blogs, Q&As, Reels, and wellness resources for the Period Buddy app." 
      />
      
      <ApiBanner />

      {/* Main Metrics Row */}
      <section className="metric-grid" aria-label="Main Stats">
        <article className="metric-card main-stats total-card">
          <div className="card-header-icon">
            <Layers3 size={22} />
          </div>
          <span className="stat-label">Total Resources</span>
          <strong className="stat-value">{counts.total}</strong>
          <span className="stat-desc">Active in content studio</span>
        </article>

        <article className="metric-card main-stats published-card">
          <div className="card-header-icon">
            <CheckCircle2 size={22} />
          </div>
          <span className="stat-label">Published</span>
          <strong className="stat-value">{counts.published}</strong>
          <span className="stat-desc">Live on user applications</span>
        </article>

        <article className="metric-card main-stats review-card">
          <div className="card-header-icon">
            <Gauge size={22} />
          </div>
          <span className="stat-label">In Medical Review</span>
          <strong className="stat-value">{counts.review}</strong>
          <span className="stat-desc">Submitted, waiting for a reviewer</span>
        </article>

        <article className="metric-card main-stats draft-card">
          <div className="card-header-icon">
            <ClipboardList size={22} />
          </div>
          <span className="stat-label">Drafts</span>
          <strong className="stat-value">{counts.drafts}</strong>
          <span className="stat-desc">Work in progress</span>
        </article>
      </section>

      <div className="dashboard-grid">
        {/* Content Type Breakdown */}
        <section className="dashboard-section type-breakdown">
          <h3 className="section-title">Library Breakdown</h3>
          <div className="breakdown-list">
            <Link to="/blogs" className="breakdown-item">
              <div className="item-icon-wrapper blog-type">
                <FileText size={18} />
              </div>
              <div className="item-details">
                <span className="item-title">Articles & Blogs</span>
                <span className="item-count">{counts.blogs} entries</span>
              </div>
              <ArrowRight size={16} className="arrow-hover" />
            </Link>

            <Link to="/qa" className="breakdown-item">
              <div className="item-icon-wrapper qa-type">
                <FileQuestion size={18} />
              </div>
              <div className="item-details">
                <span className="item-title">Q&A Forum Entries</span>
                <span className="item-count">{counts.qas} questions</span>
              </div>
              <ArrowRight size={16} className="arrow-hover" />
            </Link>

            <Link to="/videos" className="breakdown-item">
              <div className="item-icon-wrapper video-type">
                <Film size={18} />
              </div>
              <div className="item-details">
                <span className="item-title">Video Reels</span>
                <span className="item-count">{counts.videos} files</span>
              </div>
              <ArrowRight size={16} className="arrow-hover" />
            </Link>

            <Link to="/guides" className="breakdown-item">
              <div className="item-icon-wrapper guide-type">
                <BookOpen size={18} />
              </div>
              <div className="item-details">
                <span className="item-title">Wellbeing Guides & Tips</span>
                <span className="item-count">{counts.guides} resources</span>
              </div>
              <ArrowRight size={16} className="arrow-hover" />
            </Link>

            <Link to="/conditions" className="breakdown-item">
              <div className="item-icon-wrapper condition-type">
                <Heart size={18} />
              </div>
              <div className="item-details">
                <span className="item-title">Health Conditions</span>
                <span className="item-count">{counts.conditions} issues</span>
              </div>
              <ArrowRight size={16} className="arrow-hover" />
            </Link>
          </div>
        </section>

        {/* Recent updates & Quick Actions */}
        <div className="dashboard-side-column">
          {/* Quick Creator */}
          <section className="dashboard-section quick-actions">
            <h3 className="section-title">Quick Actions</h3>
            <div className="actions-button-grid">
              <Link to="/blogs" className="action-tile">
                <PlusCircle size={20} />
                <span>Write Blog</span>
              </Link>
              <Link to="/qa" className="action-tile">
                <PlusCircle size={20} />
                <span>Add Q&A</span>
              </Link>
              <Link to="/videos" className="action-tile">
                <PlusCircle size={20} />
                <span>Upload Reel</span>
              </Link>
              <Link to="/conditions" className="action-tile">
                <PlusCircle size={20} />
                <span>Create Condition</span>
              </Link>
            </div>
          </section>

          {/* Recent changes */}
          <section className="dashboard-section recent-changes">
            <h3 className="section-title">Recent Activity</h3>
            <div className="activity-list">
              {recentItems.length === 0 ? (
                <div className="empty-activity">
                  <Clock size={16} />
                  <span>No recent activity</span>
                </div>
              ) : (
                recentItems.map((item) => (
                  <div key={item.id} className="activity-card">
                    <div className="activity-main">
                      <strong className="activity-title" title={item.title}>
                        {item.title}
                      </strong>
                      <span className={`status-chip mini ${item.status}`}>
                        {item.status}
                      </span>
                    </div>
                    <span className="activity-time">
                      Updated {new Date(item.updatedAt).toLocaleDateString()} • Type: {item.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
