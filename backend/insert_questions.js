const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qjjxdqbdmhgwrxrqxdvl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqanhkcWJkbWhnd3J4cnF4ZHZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ0MjM4NzYsImV4cCI6MjA1MDAwMDAwMH0.fJpqrBCqgcCKOHdJfHZdJgfBBJGUFXJqLqBhJvYzKzY'
);

const sampleQuestions = [
  {
    que_id: 1,
    que_content: 'Two Sum: Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    testcase: {"input": "[2,7,11,15], target = 9", "output": "[0,1]", "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."},
    difficulty: 'easy'
  },
  {
    que_id: 2,
    que_content: 'Reverse Integer: Given a signed 32-bit integer x, return x with its digits reversed.',
    testcase: {"input": "x = 123", "output": "321", "explanation": "Reverse the digits of 123 to get 321."},
    difficulty: 'easy'
  },
  {
    que_id: 3,
    que_content: 'Palindrome Number: Given an integer x, return true if x is a palindrome, and false otherwise.',
    testcase: {"input": "x = 121", "output": "true", "explanation": "121 reads as 121 from left to right and from right to left."},
    difficulty: 'easy'
  },
  {
    que_id: 4,
    que_content: 'Roman to Integer: Convert a roman numeral to an integer.',
    testcase: {"input": "s = \"III\"", "output": "3", "explanation": "III = 3."},
    difficulty: 'easy'
  },
  {
    que_id: 5,
    que_content: 'Longest Common Prefix: Find the longest common prefix string amongst an array of strings.',
    testcase: {"input": "strs = [\"flower\",\"flow\",\"flight\"]", "output": "\"fl\"", "explanation": "The longest common prefix is \"fl\"."},
    difficulty: 'easy'
  },
  {
    que_id: 6,
    que_content: 'Add Two Numbers: You are given two non-empty linked lists representing two non-negative integers.',
    testcase: {"input": "l1 = [2,4,3], l2 = [5,6,4]", "output": "[7,0,8]", "explanation": "342 + 465 = 807."},
    difficulty: 'medium'
  },
  {
    que_id: 7,
    que_content: 'Longest Substring Without Repeating Characters: Find the length of the longest substring without repeating characters.',
    testcase: {"input": "s = \"abcabcbb\"", "output": "3", "explanation": "The answer is \"abc\", with the length of 3."},
    difficulty: 'medium'
  },
  {
    que_id: 8,
    que_content: 'Median of Two Sorted Arrays: Find the median of the two sorted arrays.',
    testcase: {"input": "nums1 = [1,3], nums2 = [2]", "output": "2.00000", "explanation": "merged array = [1,2,3] and median is 2."},
    difficulty: 'hard'
  },
  {
    que_id: 9,
    que_content: 'Regular Expression Matching: Implement regular expression matching with support for \'.\' and \'*\'.',
    testcase: {"input": "s = \"aa\", p = \"a*\"", "output": "true", "explanation": "\'*\' means zero or more of the preceding element, \'a\'."},
    difficulty: 'hard'
  },
  {
    que_id: 10,
    que_content: 'Container With Most Water: Find two lines that together with the x-axis form a container that holds the most water.',
    testcase: {"input": "height = [1,8,6,2,5,4,8,3,7]", "output": "49", "explanation": "The above vertical lines represent the array [1,8,6,2,5,4,8,3,7]."},
    difficulty: 'medium'
  },
  {
    que_id: 11,
    que_content: 'Valid Parentheses: Given a string s containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid.',
    testcase: {"input": "s = \"()\"", "output": "true", "explanation": "The string contains valid parentheses."},
    difficulty: 'easy'
  },
  {
    que_id: 12,
    que_content: 'Merge Two Sorted Lists: You are given the heads of two sorted linked lists list1 and list2.',
    testcase: {"input": "list1 = [1,2,4], list2 = [1,3,4]", "output": "[1,1,2,3,4,4]", "explanation": "Merge the two sorted lists."},
    difficulty: 'easy'
  },
  {
    que_id: 13,
    que_content: '3Sum: Given an integer array nums, return all the triplets [nums[i], nums[j], nums[k]] such that i != j, i != k, and j != k, and nums[i] + nums[j] + nums[k] == 0.',
    testcase: {"input": "nums = [-1,0,1,2,-1,-4]", "output": "[[-1,-1,2],[-1,0,1]]", "explanation": "The distinct triplets are [-1,-1,2] and [-1,0,1]."},
    difficulty: 'medium'
  },
  {
    que_id: 14,
    que_content: 'Letter Combinations of a Phone Number: Given a string containing digits from 2-9 inclusive, return all possible letter combinations that the number could represent.',
    testcase: {"input": "digits = \"23\"", "output": "[\"ad\",\"ae\",\"af\",\"bd\",\"be\",\"bf\",\"cd\",\"ce\",\"cf\"]", "explanation": "Map digits to letters like on a phone keypad."},
    difficulty: 'medium'
  },
  {
    que_id: 15,
    que_content: 'Merge k Sorted Lists: You are given an array of k linked-lists lists, each linked-list is sorted in ascending order.',
    testcase: {"input": "lists = [[1,4,5],[1,3,4],[2,6]]", "output": "[1,1,2,3,4,4,5,6]", "explanation": "Merge all the linked-lists into one sorted linked-list."},
    difficulty: 'hard'
  }
];

async function insertQuestions() {
  console.log('🚀 Starting to insert sample questions...');
  
  try {
    // First, check if questions already exist
    const { data: existing, error: checkError } = await supabase
      .from('battle_royale_questions')
      .select('que_id')
      .limit(1);
    
    if (checkError) {
      console.error('❌ Error checking existing questions:', checkError);
      return;
    }
    
    if (existing && existing.length > 0) {
      console.log('✅ Questions already exist in database. Skipping insertion.');
      return;
    }
    
    // Insert all questions
    const { data, error } = await supabase
      .from('battle_royale_questions')
      .insert(sampleQuestions);
    
    if (error) {
      console.error('❌ Error inserting questions:', error);
      return;
    }
    
    console.log('✅ Successfully inserted', sampleQuestions.length, 'questions');
    console.log('📊 Questions by difficulty:');
    console.log('  - Easy:', sampleQuestions.filter(q => q.difficulty === 'easy').length);
    console.log('  - Medium:', sampleQuestions.filter(q => q.difficulty === 'medium').length);
    console.log('  - Hard:', sampleQuestions.filter(q => q.difficulty === 'hard').length);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

insertQuestions();
