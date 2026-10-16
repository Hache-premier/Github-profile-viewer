
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchButton = document.querySelector("#search-button");
const profileGrid = document.querySelector("#profile-grid");
const statusMessage = document.querySelector("#status-message");
const resultsCount = document.querySelector("#results-count");
const loadMoreButton = document.querySelector("#load-more-button");
const suggestionButtons = document.querySelectorAll(".suggestion");

const API_URL = "https://api.github.com";
const RESULTS_PER_PAGE = 9;

let currentQuery = "";
let currentPage = 1;
let totalResults = 0;
let isLoading = false;
let searchController = null;

const numberFormatter = new Intl.NumberFormat("en-US");

function formatNumber(number) {
  return numberFormatter.format(number ?? 0);
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function setLoading(loading) {
  isLoading = loading;
  searchButton.disabled = loading;
  searchButton.textContent = loading ? "Searching..." : "Search";
  loadMoreButton.disabled = loading;
}

function updateLoadMoreButton() {
  const hasMoreResults = currentPage * RESULTS_PER_PAGE < totalResults;

  loadMoreButton.hidden = !hasMoreResults;
}

async function fetchGitHubData(url, signal) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal,
  });

  if (!response.ok) {
    const error = new Error(`GitHub API request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchUserDetails(username, signal) {
  return fetchGitHubData(
    `${API_URL}/users/${encodeURIComponent(username)}`,
    signal,
  );
}

function createStat(label, value) {
  const container = document.createElement("div");
  const statLabel = document.createElement("span");
  const statValue = document.createElement("span");

  statLabel.className = "stat-label";
  statLabel.textContent = label;

  statValue.className = "stat-value";
  statValue.textContent = formatNumber(value);

  container.append(statLabel, statValue);

  return container;
}

function createProfileCard(user) {
  const card = document.createElement("article");
  const profileLink = document.createElement("a");
  const avatar = document.createElement("img");
  const name = document.createElement("h3");
  const username = document.createElement("p");
  const bio = document.createElement("p");
  const stats = document.createElement("div");
  const location = document.createElement("p");
  const visitLink = document.createElement("a");
  const visitText = document.createElement("span");
  const arrow = document.createElement("span");

  card.className = "profile-card";
  profileLink.className = "profile-card-link";
  profileLink.href = user.html_url;
  profileLink.target = "_blank";
  profileLink.rel = "noopener noreferrer";
  profileLink.setAttribute(
    "aria-label",
    `View ${user.login}'s GitHub profile in a new tab`,
  );

  avatar.className = "profile-avatar";
  avatar.src = user.avatar_url;
  avatar.alt = `${user.login}'s avatar`;
  avatar.loading = "lazy";
  avatar.referrerPolicy = "no-referrer";

  avatar.addEventListener("error", () => {
    avatar.hidden = true;
  });

  name.className = "profile-name";
  name.textContent = user.name || user.login;

  username.className = "profile-username";
  username.textContent = `@${user.login}`;

  bio.className = "profile-bio";
  bio.textContent = user.bio || "This developer has not added a bio yet.";

  stats.className = "profile-stats";
  stats.append(
    createStat("Followers", user.followers),
    createStat("Public repos", user.public_repos),
  );

  location.className = "profile-location";
  location.textContent = user.location
    ? `📍 ${user.location}`
    : "📍 Location not specified";

  visitLink.className = "profile-visit";
  visitLink.href = user.html_url;
  visitLink.target = "_blank";
  visitLink.rel = "noopener noreferrer";

  visitText.textContent = "View GitHub profile";
  arrow.textContent = "↗";
  arrow.setAttribute("aria-hidden", "true");

  visitLink.append(visitText, arrow);
  profileLink.append(avatar, name, username, bio, stats, location);
  card.append(profileLink, visitLink);

  return card;
}

function renderProfiles(users, append = false) {
  if (!append) {
    profileGrid.replaceChildren();
  }

  const fragment = document.createDocumentFragment();

  users.forEach((user) => {
    fragment.append(createProfileCard(user));
  });

  profileGrid.append(fragment);
}

function getErrorMessage(error) {
  if (error.name === "AbortError") {
    return "";
  }

  if (error instanceof TypeError) {
    return "Unable to connect to GitHub. Check your internet connection and try again.";
  }

  if (error.status === 403 || error.status === 429) {
    return "GitHub's API rate limit may have been reached. Please wait a little and try again.";
  }

  if (error.status === 422) {
    return "GitHub could not process this search. Try a different search term.";
  }

  if (error.status === 404) {
    return "The requested GitHub resource could not be found.";
  }

  return "Something went wrong while loading GitHub profiles. Please try again.";
}

async function searchGitHubUsers(query, page = 1) {
  if (isLoading) {
    return;
  }

  if (searchController) {
    searchController.abort();
  }

  searchController = new AbortController();
  const { signal } = searchController;

  setLoading(true);

  if (page === 1) {
    profileGrid.replaceChildren();
    resultsCount.textContent = "Searching...";
    setStatus("Looking for developers on GitHub...");
  } else {
    setStatus("Loading more developers...");
  }

  try {
    const searchParams = new URLSearchParams({
      q: query,
      per_page: String(RESULTS_PER_PAGE),
      page: String(page),
    });

    const searchData = await fetchGitHubData(
      `${API_URL}/search/users?${searchParams}`,
      signal,
    );

    if (signal.aborted) {
      return;
    }

    totalResults = Math.min(searchData.total_count, 1000);

    if (searchData.items.length === 0 && page === 1) {
      resultsCount.textContent = "0 results";
      setStatus("No GitHub users found. Try another name or username.");
      updateLoadMoreButton();
      return;
    }

    const detailResults = await Promise.allSettled(
      searchData.items.map((user) => fetchUserDetails(user.login, signal)),
    );

    if (signal.aborted) {
      return;
    }

    const profiles = detailResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (profiles.length === 0) {
      throw new Error("No profile details could be loaded.");
    }

    renderProfiles(profiles, page > 1);

    currentPage = page;

    resultsCount.textContent =
      `${formatNumber(Math.min(currentPage * RESULTS_PER_PAGE, totalResults))} of ${formatNumber(totalResults)} results`;

    setStatus(
      `Showing GitHub profiles matching "${query}".`,
    );

    updateLoadMoreButton();
  } catch (error) {
    if (signal.aborted) {
      return;
    }

    setStatus(getErrorMessage(error));

    if (page === 1) {
      resultsCount.textContent = "Search unavailable";
    }
  } finally {
    if (searchController?.signal === signal) {
      setLoading(false);
    }
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const query = searchInput.value.trim();

  if (!query) {
    setStatus("Please enter a GitHub username or name.");
    searchInput.focus();
    return;
  }

  currentQuery = query;
  currentPage = 1;

  searchGitHubUsers(currentQuery, currentPage);
});

loadMoreButton.addEventListener("click", () => {
  if (!isLoading && currentQuery) {
    searchGitHubUsers(currentQuery, currentPage + 1);
  }
});

suggestionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const username = button.dataset.username;

    searchInput.value = username;
    searchForm.requestSubmit();
  });
});
