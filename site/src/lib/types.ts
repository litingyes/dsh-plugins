/** The two locales the portal is written in. Chinese is the default route. */
export type Locale = 'zh' | 'en'

/** A string in both locales, kept together so a page never half-translates. */
export interface L {
  zh: string
  en: string
}

/** One changed file inside a commit detail. */
export interface GraphFile {
  path: string
  status: string
  added: number
  deleted: number
  binary: boolean
}

/** One laid-out lane row, produced by the plugin's own `layoutGraph`. */
export interface GraphRow {
  sha: string
  lane: number
  color: number
  through: { lane: number; color: number }[]
  incoming: { from: number; color: number }[]
  outgoing: { to: number; color: number }[]
}

/** The generated `repo-graph.json`, committed so builds never need git history. */
export interface RepoGraph {
  source: {
    head: string
    headShort: string
    headDate: string
    currentBranch: string
    total: number
    limit: number
    truncated: boolean
  }
  commits: {
    sha: string
    short?: string
    parents: string[]
    author: string
    email: string
    date: string
    subject: string
    refs: { name: string; kind: string }[]
    onCurrent: boolean
  }[]
  layout: { rows: GraphRow[]; laneCount: number; overflow: boolean }
  branches: {
    name: string
    sha: string
    short: string
    upstream: string
    date: string
    current: boolean
  }[]
  details: Record<
    string,
    {
      message: string
      author: { name: string; email: string }
      committer: { name: string; email: string }
      committedAt: string
      files: GraphFile[]
      filesTruncated: boolean
      diff: { path: string; lines: string[]; truncated: boolean } | null
    }
  >
}

/** Name, version and DSH range, read from each plugin's package manifest. */
export interface PluginsMeta {
  [slug: string]: {
    name: string
    version: string
    dsh: string
    description: string
    homepage: string
  }
}

export interface ToolDoc {
  name: string
  args: string
  desc: L
}

export interface ConfigDoc {
  field: string
  value: string
  desc: L
}

export interface FeatureDoc {
  title: L
  body: L
}

export interface PluginDoc {
  slug: string
  packageName: string
  icon: string
  name: L
  tagline: L
  summary: L
  runtime: L
  install: string
  installNote: L
  requirements: L[]
  features: FeatureDoc[]
  tools: ToolDoc[]
  config: ConfigDoc[]
  security: L[]
  limits: L[]
  readme: string
  // Which signal colour a plugin owns on the page: the panel is the person's
  // surface (amber), the Context7 rows are the agent's (cool).
  signal: 'accent' | 'cool'
}
