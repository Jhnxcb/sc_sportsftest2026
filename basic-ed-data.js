// Shared team and event definitions for the public display and admin.
const departments = {
  grade: { name: 'Grade School Department', short: 'Grade School', enabled: true, teams: [
    { id: 'harks', color: '#87ceeb', name: 'Mighty Sharks', detail: 'Grade School', logo: 'GRADE SCHOOL/MIGHTY HARKS.png' },
    { id: 'cubs', color: '#ff8c00', name: 'Fearless Cubs', detail: 'Grade School', logo: 'GRADE SCHOOL/FEARLESS CUBS.png' }
  ] },
  junior: { name: 'Junior High School Department', short: 'Junior High School', enabled: true, teams: [
    { id: 'greenfinches', color: '#32cd32', name: 'Fervid Greenfinches', detail: 'Grade 7', logo: 'JUNIOR HIGH SCHOOL/GRADE 7 - Fervid Greenfinches.png' },
    { id: 'tigers', color: '#ffd700', name: 'Roaring Tigers', detail: 'Grade 8', logo: 'JUNIOR HIGH SCHOOL/GRADE 8 - Roaring Tigers.png' },
    { id: 'vipers', color: '#ff3333', name: 'Grebesha Vipers', detail: 'Grade 9', logo: 'JUNIOR HIGH SCHOOL/GRADE  9 - Grebesha Vipers.png' },
    { id: 'wolves', color: '#000080', name: 'Azura Wolves', detail: 'Grade 10', logo: 'JUNIOR HIGH SCHOOL/GRADE 10 - Azura Wolves.png' }
  ] },
  senior: { name: 'Senior High School Department', short: 'Senior High School', enabled: true, teams: [
    { id: 'centaurus', color: '#a0522d', name: 'Ethereal Centaurus', detail: 'Senior High School', logo: 'SENIOR HIGH SCHOOL/Ethereal Centaurus.png' },
    { id: 'stallion', color: '#ff00ff', name: 'Ferocious Stallion', detail: 'Senior High School', logo: 'SENIOR HIGH SCHOOL/Ferocious Stallion.png' },
    { id: 'griffin', color: '#800000', name: 'Griffin Guardian', detail: 'Senior High School', logo: 'SENIOR HIGH SCHOOL/Griffin Gaurdian.png' }
  ] },
  college: { name: 'College Department', short: 'College', enabled: false, teams: [] }
};
function awardDepartments(collegeTeams) {
  return [
    ...Object.values(departments).filter(dept => dept.teams.length).map(dept => ({
      ...dept, teams: dept.teams.map(team => ({ ...team, logo: 'DEPT LOGOS/BASIC ED/' + team.logo }))
    })),
    { short: 'College', teams: Object.entries(collegeTeams).map(([id, team]) => ({ id, name: team.team, logo: team.logo })) }
  ];
}
const events = [
  { id: 'cheerdance', name: 'Cheerdance Competition' },
  { id: 'bench', name: 'Bench Cheering Competition' },
  { id: 'mr', name: 'Mr. Sportsfest' },
  { id: 'ms', name: 'Ms. Sportsfest' }
];

// Playback order and initial visibility. Every section is controlled from admin.
const DISPLAY_SECTIONS = [
  {id:'senior', label:'Senior High School', enabled:true},
  {id:'junior', label:'Junior High School', enabled:true},
  {id:'grade', label:'Grade School', enabled:true},
  {id:'college', label:'College', enabled:false},
  {id:'awards', label:'Results', enabled:true},
  {id:'matches', label:'Matches', enabled:true},
  {id:'matches2', label:'Matches', enabled:false},
  {id:'promo', label:'Campus video', enabled:false},
  {id:'sportsfest', label:'Sportsfest video', enabled:false}
];
