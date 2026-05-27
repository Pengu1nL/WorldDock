import { useCallback, useEffect, useMemo, useState } from "react";
import type { CommunityRepository, RepositoryCollection } from "./api";
import {
  addRepositoryToCollection,
  forkRepository,
  listCommunityRepositories,
  removeRepositoryFromCollection,
  reportRepository,
  starRepository,
  unstarRepository,
} from "./api";
import { CollectionsPage } from "../community/collections-page";
import { CreatorProfilePage } from "../community/creator-profile-page";
import { ExplorePage } from "../community/explore-page";
import { RepositoryDetailPage } from "../community/repository-detail-page";
import { PUBLIC_REPOSITORIES } from "./fixtures";

type ToastInput = {
  kind: "save" | "warn" | "info";
  text: string;
};

type SavedCollection = {
  collection: RepositoryCollection;
  repository: CommunityRepository;
};

type CommunityViewProps = {
  onBack: () => void;
  onFork: (repository: CommunityRepository) => void;
  onToast: (toast: ToastInput) => void;
};

export function CommunityView({ onBack, onFork, onToast }: CommunityViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"relevance" | "stars" | "forks" | "updated">("updated");
  const [activeRepository, setActiveRepository] = useState<CommunityRepository | null>(null);
  const [creatorHandle, setCreatorHandle] = useState<string | null>(null);
  const [showCollections, setShowCollections] = useState(false);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [repositories, setRepositories] = useState<CommunityRepository[]>(PUBLIC_REPOSITORIES);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<SavedCollection[]>([]);

  const sessionToken = useCallback(() => typeof window === "undefined"
    ? ""
    : window.localStorage.getItem("worlddock.sessionToken") ?? "", []);

  const currentCollection = useMemo(() => {
    if (!activeRepository) return undefined;
    return collections.find((item) => item.repository.id === activeRepository.id)?.collection;
  }, [activeRepository, collections]);

  const loadRepositories = useCallback(async (cursor: string | null) => {
    setLoading(true);
    const session = sessionToken();
    try {
      const result = await listCommunityRepositories({
        sessionToken: session,
        query,
        sort,
        cursor: cursor ?? undefined,
      });
      setRepositories((prev) => cursor ? [...prev, ...result.repositories] : result.repositories);
      setNextCursor(result.nextCursor);
    } catch {
      if (!session) {
        const fallback = filterFixtureRepositories(query, sort);
        setRepositories((prev) => cursor ? prev : fallback);
        setNextCursor(null);
      } else {
        setRepositories([]);
        setNextCursor(null);
      }
    } finally {
      setLoading(false);
    }
  }, [query, sessionToken, sort]);

  useEffect(() => {
    void loadRepositories(null);
  }, [loadRepositories]);

  if (showCollections) {
    return (
      <CollectionsPage
        collections={collections}
        onBack={() => setShowCollections(false)}
        onOpenRepository={(repository) => {
          setActiveRepository(repository);
          setShowCollections(false);
        }}
        onRemove={(item) => {
          void toggleCollection(item.repository);
        }}
      />
    );
  }

  if (creatorHandle) {
    return (
      <CreatorProfilePage
        handle={creatorHandle}
        sessionToken={sessionToken()}
        onBack={() => setCreatorHandle(null)}
        onOpenRepository={(repository) => {
          setActiveRepository(repository);
          setCreatorHandle(null);
        }}
      />
    );
  }

  if (activeRepository) {
    return (
      <RepositoryDetailPage
        repository={activeRepository}
        sessionToken={sessionToken()}
        starred={starredIds.includes(activeRepository.id)}
        collection={currentCollection}
        onBack={() => setActiveRepository(null)}
        onOpenCreator={(handle) => setCreatorHandle(handle)}
        onToggleCollection={(repository) => {
          void toggleCollection(repository);
        }}
        onStar={async () => {
          const alreadyStarred = starredIds.includes(activeRepository.id);
          const session = sessionToken();
          try {
            if (session) {
              const result: any = alreadyStarred
                ? await unstarRepository(activeRepository.id, { sessionToken: session })
                : await starRepository(activeRepository.id, { sessionToken: session });
              setActiveRepository(result.repository);
              setRepositories((prev) => prev.map((item) => item.id === result.repository.id ? result.repository : item));
            }
          } catch {
            onToast({ kind: "info", text: "云端 Star 暂不可用，已更新本地状态" });
          }
          setStarredIds((prev) => alreadyStarred
            ? prev.filter((id) => id !== activeRepository.id)
            : [...prev, activeRepository.id]);
          onToast({ kind: "save", text: (alreadyStarred ? "已取消 Star · " : "已 Star · ") + activeRepository.name });
        }}
        onFork={async () => {
          const session = sessionToken();
          if (session) {
            try {
              await forkRepository(activeRepository.id, { sessionToken: session });
            } catch {
              onToast({ kind: "info", text: "云端 Fork 暂不可用，已生成本地演示副本" });
            }
          }
          onFork(activeRepository);
          onToast({ kind: "save", text: "Fork 成功 · 已生成私有世界" });
        }}
        onReport={async (input) => {
          const session = sessionToken();
          if (session) {
            await reportRepository(activeRepository.id, input, { sessionToken: session });
          }
          onToast({ kind: "warn", text: "举报已提交 · Alpha 团队会人工处理" });
        }}
      />
    );
  }

  return (
    <ExplorePage
      repositories={repositories}
      query={query}
      sort={sort}
      loading={loading}
      nextCursor={nextCursor}
      onBack={onBack}
      onQueryChange={setQuery}
      onSortChange={(nextSort) => setSort(nextSort ?? "updated")}
      onOpenRepository={setActiveRepository}
      onOpenCreator={setCreatorHandle}
      onOpenCollections={() => setShowCollections(true)}
      onLoadMore={() => nextCursor && loadRepositories(nextCursor)}
    />
  );

  async function toggleCollection(repository: CommunityRepository) {
    const existing = collections.find((item) => item.repository.id === repository.id);
    const session = sessionToken();
    if (existing) {
      if (session) {
        try {
          await removeRepositoryFromCollection(repository.id, existing.collection.id, { sessionToken: session });
        } catch {
          onToast({ kind: "info", text: "云端收藏夹暂不可用，已更新本地状态" });
        }
      }
      setCollections((prev) => prev.filter((item) => item.repository.id !== repository.id));
      onToast({ kind: "save", text: "已移出收藏夹 · " + repository.name });
      return;
    }

    let collection: RepositoryCollection = {
      id: `local_collection_${repository.id}`,
      repositoryId: repository.id,
      userId: "local",
      name: "saved",
      createdAt: new Date().toISOString(),
    };
    if (session) {
      try {
        const result = await addRepositoryToCollection(repository.id, { sessionToken: session });
        collection = result.collection;
      } catch {
        onToast({ kind: "info", text: "云端收藏夹暂不可用，已保存本地状态" });
      }
    }
    setCollections((prev) => [...prev, { collection, repository }]);
    onToast({ kind: "save", text: "已加入收藏夹 · " + repository.name });
  }
}

function filterFixtureRepositories(
  query: string,
  sort: "relevance" | "stars" | "forks" | "updated",
) {
  const normalized = query.trim().toLowerCase();
  const filtered = PUBLIC_REPOSITORIES.filter((repository) => {
    const text = `${repository.name} ${repository.summary} ${repository.owner} ${repository.tags.join(" ")}`.toLowerCase();
    return !normalized || text.includes(normalized);
  });
  if (sort === "stars") return [...filtered].sort((left, right) => right.stars - left.stars);
  if (sort === "forks") return [...filtered].sort((left, right) => right.forks - left.forks);
  return filtered;
}
