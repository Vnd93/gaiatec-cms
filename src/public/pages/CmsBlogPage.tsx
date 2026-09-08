import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getPublishedPosts, type PublishedPost } from "../catalog-api";
import "../site-builder.css";

export default function CmsBlogPage() {
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    document.title = "Blog técnico | GAIATEC SISTEMAS";
    void getPublishedPosts()
      .then((result) => active && setPosts(result.items))
      .catch(() => active && setError("O blog está temporariamente indisponível."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="cms-managed-page" aria-label="Blog técnico">
      <header className="cms-page-block cms-page-block--hero cms-page-block--dark cms-page-block--full">
        <div className="cms-page-block__inner is-left">
          <p className="cms-page-eyebrow">CONTEÚDO TÉCNICO</p>
          <h1>Blog</h1>
          <p className="cms-page-lead">Conteúdo técnico para apoiar decisões de engenharia e operação.</p>
        </div>
      </header>
      <section
        className="cms-page-block cms-page-block--content_grid cms-page-block--light cms-page-block--wide"
        aria-labelledby="blog-list-title"
      >
        <div className="cms-page-block__inner">
          <h2 id="blog-list-title">Artigos e análises</h2>
          {loading ? (
            <p aria-busy="true">Carregando artigos…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : posts.length === 0 ? (
            <p>Nenhum artigo está disponível no momento. Volte em breve para conferir as novidades.</p>
          ) : (
            <div className="cms-page-grid is-3">
              {posts.map((post) => (
                <article className="cms-page-card" key={post.key}>
                  <p className="cms-page-eyebrow">{post.payload.category.name}</p>
                  <h3>
                    <Link to={post.path}>{post.payload.title}</Link>
                  </h3>
                  <p>{post.payload.excerpt}</p>
                  <small>
                    {post.payload.author.name} · {post.payload.readingMinutes} min
                  </small>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
