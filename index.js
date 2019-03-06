const { spawnSync } = require("child_process");
const markdownEscape = require("markdown-escape");

const generateChangelog = (originName) => {
  const getOrigin = spawnSync("git", ["remote", "get-url", originName]);

  const repositoryUrl = getOrigin.stdout
    .toString()
    .replace(/^git@github.com:/, "https://github.com/")
    .replace(/\n/g, "")
    .replace(/.git$/, "");

  const getTags = spawnSync("git", [
    "for-each-ref",
    "--sort=taggerdate",
    "--format",
    "%(tag)|%(taggerdate:short)|%(objectname)",
    "refs/tags"
  ]);

  let lastHash = null;
  const tags = getTags.stdout
    .toString()
    .split("\n")
    .filter(line => line && line.match(/^v?[0-9]+\.[0-9]+\.[0-9]+\|/))
    .map(line => {
      const [tag, date, hash] = line.split("|");

      const commitRange = lastHash ? `${lastHash}..${hash}` : hash;

      const getMerges = spawnSync("git", [
        "log",
        "--merges",
        "--pretty=%s|||||%b|||||%H|||||[%an](mailto:%ae)|||||%P=====",
        commitRange
      ]);

      const merges = getMerges.stdout
        .toString()
        .split("=====\n")
        .filter(line => line && line.startsWith("Merge pull request"))
        .map(line => line.replace(/\n/g, ""))
        .map(line => line.split("|||||"))
        .map(([pullRequest, message, mergeHash, mergeAuthor, parents]) => {
          const pullRequestNumber = pullRequest.match(
            /Merge pull request #(\d+) from/
          )[1];
          const [from, to] = parents.split(" ");

          const authors = new Set();
          const getAuthors = spawnSync("git", [
            "log",
            "--pretty=[%an](mailto:%ae)",
            `${from}..${to}`
          ]);

          getAuthors.stdout
            .toString()
            .split("\n")
            .filter(line => line)
            .forEach(author => authors.add(author));

          return {
            authors: Array.from(authors).sort(),
            mergeAuthor,
            message,
            pullRequestNumber
          };
        });

      const getRegularCommits = spawnSync("git", [
        "log",
        "--no-merges",
        "--first-parent",
        "--pretty=%s|||||%b|||||%H|||||[%an](mailto:%ae)|||||%P=====",
        commitRange
      ]);

      const regularCommits = getRegularCommits.stdout
        .toString()
        .split("=====\n")
        // Crudely skip version commits (with "x.y.z" message):
        .filter(line => line && !/^[\d+.-]+\|\|\|\|\|/.test(line))
        .map(line => line.replace(/\n/g, ""))
        .map(line => line.split("|||||"))
        .map(([message, body, commitHash, author]) => {
          return {
            author,
            message,
            commitHash
          };
        });

      lastHash = hash;

      return {
        tag,
        date,
        merges,
        regularCommits
      };
    });

  tags.reverse().forEach(({ tag, date, merges, regularCommits }) => {
    if (merges.length > 0 || regularCommits.length > 0) {
      merges.forEach(({ authors, mergeAuthor, message, pullRequestNumber }) => {
      console.log(`### ${tag} (${date})\n`);
        console.log(
          `- [#${pullRequestNumber}](${repositoryUrl}/pull/${pullRequestNumber}) ${markdownEscape(message)} (${authors.join(
            ", "
          )})`
        );
      });

      regularCommits.forEach(({ author, message, commitHash }) => {
        console.log(
          `- [${markdownEscape(message)}](${repositoryUrl}/commit/${commitHash}) (${author})`
        );
      });

      console.log();
    }
  });
};

module.exports = { generateChangelog };
