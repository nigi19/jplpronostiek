import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  primaryKey,
  serial,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── Auth.js tables ───────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ─── Domain tables ────────────────────────────────────────────────────────────

/** A football season, e.g. "Jupiler Pro League 2024/25" */
export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  apiLeagueId: integer("apiLeagueId").notNull().default(144),
  year: integer("year").notNull(), // e.g. 2024 (for 2024/25)
  name: text("name").notNull(),    // e.g. "2024/25"
  isActive: boolean("isActive").notNull().default(false),
  lastSyncedAt: timestamp("lastSyncedAt", { mode: "date" }),
  syncError: text("syncError"),
});

/** A football team, upserted from the API */
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  apiTeamId: integer("apiTeamId").notNull(),
  name: text("name").notNull(),
  shortName: text("shortName"),
  logoUrl: text("logoUrl"),
}, (t) => [uniqueIndex("teams_apiTeamId_idx").on(t.apiTeamId)]);

/** A matchweek / round in a season */
export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  seasonId: integer("seasonId")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),   // e.g. "Regular Season - 3"
  number: integer("number").notNull(), // 1-based matchweek number
}, (r) => [uniqueIndex("rounds_seasonId_number_idx").on(r.seasonId, r.number)]);

/**
 * A single match (fixture).
 * status mirrors API-Football short codes: NS, 1H, HT, 2H, ET, P, FT, AET, PEN, PST, CANC, ABD, etc.
 * homeGoals / awayGoals are null until the match is finished.
 */
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  apiFixtureId: integer("apiFixtureId").notNull(),
  seasonId: integer("seasonId")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  roundId: integer("roundId")
    .notNull()
    .references(() => rounds.id, { onDelete: "cascade" }),
  homeTeamId: integer("homeTeamId")
    .notNull()
    .references(() => teams.id),
  awayTeamId: integer("awayTeamId")
    .notNull()
    .references(() => teams.id),
  kickoff: timestamp("kickoff", { mode: "date", withTimezone: true }).notNull(),
  status: text("status").notNull().default("NS"),
  homeGoals: integer("homeGoals"),
  awayGoals: integer("awayGoals"),
  lastSyncedAt: timestamp("lastSyncedAt", { mode: "date" }),
}, (m) => [
  uniqueIndex("matches_apiFixtureId_idx").on(m.apiFixtureId),
  index("matches_roundId_idx").on(m.roundId),
  index("matches_kickoff_idx").on(m.kickoff),
]);

/** A group of friends — their private "league" */
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("inviteCode").notNull(),
  ownerId: text("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (g) => [uniqueIndex("groups_inviteCode_idx").on(g.inviteCode)]);

export const groupMembers = pgTable("groupMembers", {
  groupId: integer("groupId")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // "owner" | "member"
  joinedAt: timestamp("joinedAt", { mode: "date" }).notNull().defaultNow(),
}, (gm) => [primaryKey({ columns: [gm.groupId, gm.userId] })]);

/**
 * A player's prediction for a single match.
 * points is null until the match is finished and scored.
 * A missing row means "no prediction submitted" = 0 points.
 */
export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  matchId: integer("matchId")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  homeGoals: integer("homeGoals").notNull(),
  awayGoals: integer("awayGoals").notNull(),
  points: integer("points"),  // null until computed
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
}, (p) => [
  uniqueIndex("predictions_userId_matchId_idx").on(p.userId, p.matchId),
  index("predictions_matchId_idx").on(p.matchId),
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
