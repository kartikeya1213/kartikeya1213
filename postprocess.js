const fs = require('fs');
const path = require('path');

// Read token from environment variable
const token = process.env.PERSONAL_TOKEN;
if (!token) {
  console.error('Error: PERSONAL_TOKEN environment variable is required.');
  process.exit(1);
}

const query = {
  query: `query {
    viewer {
      repositories(first: 100, ownerAffiliations: OWNER) {
        totalCount
        nodes {
          name
          languages(first: 20) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
      contributionsCollection {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        restrictedContributionsCount
      }
    }
  }`
};

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

function getDonutSlicePath(startAngle, endAngle) {
  const R_out = 117;
  const R_in = 65;
  const startOut = polarToCartesian(0, 0, R_out, startAngle);
  const endOut = polarToCartesian(0, 0, R_out, endAngle);
  const startIn = polarToCartesian(0, 0, R_in, startAngle);
  const endIn = polarToCartesian(0, 0, R_in, endAngle);
  
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  
  return `M${startOut.x.toFixed(2)},${startOut.y.toFixed(2)}A117,117,0,${largeArcFlag},1,${endOut.x.toFixed(2)},${endOut.y.toFixed(2)}L${endIn.x.toFixed(2)},${endIn.y.toFixed(2)}A65,65,0,${largeArcFlag},0,${startIn.x.toFixed(2)},${startIn.y.toFixed(2)}Z`;
}

function generateAnimValues(index, total) {
  const arr = [];
  for (let i = 0; i < 7; i++) {
    if (i < index) {
      arr.push(0);
    } else {
      const val = ((i - index) / (6 - index)).toFixed(1);
      arr.push(val);
    }
  }
  return arr.join(';');
}

async function main() {
  console.log('Querying GitHub GraphQL API for all contributions and languages...');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': 'bearer ' + token,
      'User-Agent': 'node-fetch',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });
  
  const data = await res.json();
  if (data.errors) {
    console.error('GraphQL Errors:', data.errors);
    process.exit(1);
  }
  
  const viewer = data.data.viewer;
  const repos = viewer.repositories.nodes;
  
  // Calculate languages breakdown
  const languagesMap = {};
  let totalBytes = 0;
  for (const repo of repos) {
    const edges = repo.languages?.edges || [];
    for (const edge of edges) {
      const name = edge.node.name;
      const color = edge.node.color || '#cccccc';
      const size = edge.size;
      totalBytes += size;
      if (!languagesMap[name]) {
        languagesMap[name] = { size: 0, color: color };
      }
      languagesMap[name].size += size;
    }
  }
  
  // Sort languages by size
  const sortedLangs = Object.entries(languagesMap)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([name, info]) => ({
      name,
      color: info.color,
      size: info.size,
      percentage: (info.size / totalBytes) * 100
    }));
    
  // Keep top 4 and group others into "other"
  const finalLangs = [];
  let otherSize = 0;
  let otherPct = 0;
  for (let i = 0; i < sortedLangs.length; i++) {
    if (i < 4) {
      finalLangs.push(sortedLangs[i]);
    } else {
      otherSize += sortedLangs[i].size;
      otherPct += sortedLangs[i].percentage;
    }
  }
  if (otherSize > 0) {
    finalLangs.push({
      name: 'other',
      color: '#444444',
      size: otherSize,
      percentage: otherPct
    });
  }
  
  // Calculate radar chart coordinates
  // total commits = public commits + restricted contributions
  const commitsCount = viewer.contributionsCollection.totalCommitContributions + viewer.contributionsCollection.restrictedContributionsCount;
  const reposCount = viewer.repositories.totalCount;
  const issuesCount = viewer.contributionsCollection.totalIssueContributions;
  const pullRequestsCount = viewer.contributionsCollection.totalPullRequestContributions;
  const reviewsCount = viewer.contributionsCollection.totalPullRequestReviewContributions;
  
  console.log('Real Stats calculated:');
  console.log(`- Commits: ${commitsCount}`);
  console.log(`- Repositories: ${reposCount}`);
  console.log(`- Issues: ${issuesCount}`);
  console.log(`- PullRequests: ${pullRequestsCount}`);
  console.log(`- Reviews: ${reviewsCount}`);
  console.log('Languages breakdown:', finalLangs.map(l => `${l.name} (${l.percentage.toFixed(1)}%)`));
  
  // Radar geometry calculation
  const getRadarDistance = (val) => {
    if (val <= 0) return 24.96; // Minimum scale placeholder
    return 31.2 * (Math.log10(val) + 1);
  };
  
  const d_commit = getRadarDistance(commitsCount);
  const d_issue = getRadarDistance(issuesCount);
  const d_pull = getRadarDistance(pullRequestsCount);
  const d_review = getRadarDistance(reviewsCount);
  const d_repo = getRadarDistance(reposCount);
  
  // Vectors
  const p_commit = { x: 0, y: -d_commit };
  const p_issue = { x: d_issue * 0.95106, y: -d_issue * 0.30902 };
  const p_pull = { x: d_pull * 0.58779, y: d_pull * 0.80902 };
  const p_review = { x: -d_review * 0.58779, y: d_review * 0.80902 };
  const p_repo = { x: -d_repo * 0.95106, y: -d_repo * 0.30902 };
  
  const points = `${p_commit.x.toFixed(2)},${p_commit.y.toFixed(2)} ${p_issue.x.toFixed(2)},${p_issue.y.toFixed(2)} ${p_pull.x.toFixed(2)},${p_pull.y.toFixed(2)} ${p_review.x.toFixed(2)},${p_review.y.toFixed(2)} ${p_repo.x.toFixed(2)},${p_repo.y.toFixed(2)}`;
  const animValues = `0,-24.96 23.74,-7.71 14.67,20.19 -14.67,20.19 -23.74,-7.71;${points}`;
  
  // Generate SVG blocks
  let paths = '';
  let legends = '';
  let startAngle = 0;
  const legendYStart = 54.17;
  
  for (let i = 0; i < finalLangs.length; i++) {
    const lang = finalLangs[i];
    const angleSize = (lang.percentage / 100) * 360;
    const endAngle = startAngle + angleSize;
    
    const pathD = getDonutSlicePath(startAngle, endAngle);
    const anim = generateAnimValues(i, finalLangs.length);
    
    paths += `<path d="${pathD}" style="fill: ${lang.color};" class="stroke-bg" stroke-width="2px"><title>${lang.name} ${lang.size}</title><animate attributeName="fill-opacity" values="${anim}" dur="3s" repeatCount="1"></animate></path>`;
    
    const rectY = legendYStart + i * 32.5;
    const textY = rectY + 10.83;
    
    legends += `<rect x="0" y="${rectY.toFixed(2)}" width="21.67" height="21.67" fill="${lang.color}" class="stroke-bg" stroke-width="1px"><animate attributeName="fill-opacity" values="${anim}" dur="3s" repeatCount="1"></animate></rect>`;
    legends += `<text dominant-baseline="middle" x="26" y="${textY.toFixed(2)}" class="fill-fg" font-size="21.67px">${lang.name}<animate attributeName="fill-opacity" values="${anim}" dur="3s" repeatCount="1"></animate></text>`;
    
    startAngle = endAngle;
  }
  
  const customLangGroup = `<g transform="translate(40, 520)"><g transform="translate(273, 0)">${legends}</g><g transform="translate(130, 130)">${paths}</g></g>`;
  
  // Process all files
  const dir = 'profile-3d-contrib';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg'));
  console.log(`Updating ${files.length} SVG files...`);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Make sure display="none" is removed if it was added previously
    content = content.replace('transform="translate(980, 284.5)" display="none"', 'transform="translate(980, 284.5)"');
    content = content.replace('transform="translate(40, 520)" display="none"', 'transform="translate(40, 520)"');
    
    // Update radar chart values/titles
    content = content.replace(/Commit<title>\d+<\/title>/, `Commit<title>${commitsCount}</title>`);
    content = content.replace(/Repo<title>\d+<\/title>/, `Repo<title>${reposCount}</title>`);
    content = content.replace(/Issue<title>\d+<\/title>/, `Issue<title>${issuesCount}</title>`);
    content = content.replace(/PullReq<title>\d+<\/title>/, `PullReq<title>${pullRequestsCount}</title>`);
    content = content.replace(/Review<title>\d+<\/title>/, `Review<title>${reviewsCount}</title>`);
    
    // Update radar chart polygon points
    content = content.replace(/<polygon class="radar"[\s\S]*?<\/polygon>/, 
      `<polygon class="radar" points="${points}"><animate attributeName="points" values="${animValues}" dur="3s" repeatCount="1"></animate></polygon>`
    );
    
    // Update language group
    content = content.replace(/<g transform="translate\(40,\s*520\)"[\s\S]*?<\/g>\s*<\/g>\s*<\/g>\s*<g><text style="font-size: 32px; font-weight: bold;" x="384"/,
      `${customLangGroup}</g><g><text style="font-size: 32px; font-weight: bold;" x="384"`
    );
    // Alternate match pattern just in case formatting is slightly different
    content = content.replace(/<g transform="translate\(40,\s*520\)"[\s\S]*?<\/g>\s*<\/g>\s*<g><text style="font-size: 32px; font-weight: bold;" x="384"/,
      `${customLangGroup}<g><text style="font-size: 32px; font-weight: bold;" x="384"`
    );
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`- Updated ${file}`);
  }
  
  console.log('SVG postprocessing completed successfully!');
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
