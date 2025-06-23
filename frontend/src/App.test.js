import { render, screen } from '@testing-library/react';
import App from './App';
import DuelCF from './DuelCF';

test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});

test('renders refresh forfeit note in DuelCF', () => {
  const { getByText } = render(<DuelCF user={{ id: 'test', codeforces_handle: 'test_handle' }} />);
  expect(getByText(/refreshing the page will remove you from the duel/i)).toBeInTheDocument();
});
