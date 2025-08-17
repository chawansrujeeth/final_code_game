-- Sample questions for battle royale game
-- Insert into battle_royale_questions table

INSERT INTO battle_royale_questions (que_id, que_content, testcase, difficulty) VALUES
(1, 'Two Sum: Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.', 
 '{"input": "[2,7,11,15], target = 9", "output": "[0,1]", "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."}', 
 'easy'),

(2, 'Reverse Integer: Given a signed 32-bit integer x, return x with its digits reversed.', 
 '{"input": "x = 123", "output": "321", "explanation": "Reverse the digits of 123 to get 321."}', 
 'easy'),

(3, 'Palindrome Number: Given an integer x, return true if x is a palindrome, and false otherwise.', 
 '{"input": "x = 121", "output": "true", "explanation": "121 reads as 121 from left to right and from right to left."}', 
 'easy'),

(4, 'Roman to Integer: Convert a roman numeral to an integer.', 
 '{"input": "s = \"III\"", "output": "3", "explanation": "III = 3."}', 
 'easy'),

(5, 'Longest Common Prefix: Find the longest common prefix string amongst an array of strings.', 
 '{"input": "strs = [\"flower\",\"flow\",\"flight\"]", "output": "\"fl\"", "explanation": "The longest common prefix is \"fl\"."}', 
 'easy'),

(6, 'Add Two Numbers: You are given two non-empty linked lists representing two non-negative integers.', 
 '{"input": "l1 = [2,4,3], l2 = [5,6,4]", "output": "[7,0,8]", "explanation": "342 + 465 = 807."}', 
 'medium'),

(7, 'Longest Substring Without Repeating Characters: Find the length of the longest substring without repeating characters.', 
 '{"input": "s = \"abcabcbb\"", "output": "3", "explanation": "The answer is \"abc\", with the length of 3."}', 
 'medium'),

(8, 'Median of Two Sorted Arrays: Find the median of the two sorted arrays.', 
 '{"input": "nums1 = [1,3], nums2 = [2]", "output": "2.00000", "explanation": "merged array = [1,2,3] and median is 2."}', 
 'hard'),

(9, 'Regular Expression Matching: Implement regular expression matching with support for \'.\' and \'*\'.', 
 '{"input": "s = \"aa\", p = \"a*\"", "output": "true", "explanation": "\'*\' means zero or more of the preceding element, \'a\'."}', 
 'hard'),

(10, 'Container With Most Water: Find two lines that together with the x-axis form a container that holds the most water.', 
 '{"input": "height = [1,8,6,2,5,4,8,3,7]", "output": "49", "explanation": "The above vertical lines represent the array [1,8,6,2,5,4,8,3,7]."}', 
 'medium'),

(11, 'Valid Parentheses: Given a string s containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid.', 
 '{"input": "s = \"()\"", "output": "true", "explanation": "The string contains valid parentheses."}', 
 'easy'),

(12, 'Merge Two Sorted Lists: You are given the heads of two sorted linked lists list1 and list2.', 
 '{"input": "list1 = [1,2,4], list2 = [1,3,4]", "output": "[1,1,2,3,4,4]", "explanation": "Merge the two sorted lists."}', 
 'easy'),

(13, '3Sum: Given an integer array nums, return all the triplets [nums[i], nums[j], nums[k]] such that i != j, i != k, and j != k, and nums[i] + nums[j] + nums[k] == 0.', 
 '{"input": "nums = [-1,0,1,2,-1,-4]", "output": "[[-1,-1,2],[-1,0,1]]", "explanation": "The distinct triplets are [-1,-1,2] and [-1,0,1]."}', 
 'medium'),

(14, 'Letter Combinations of a Phone Number: Given a string containing digits from 2-9 inclusive, return all possible letter combinations that the number could represent.', 
 '{"input": "digits = \"23\"", "output": "[\"ad\",\"ae\",\"af\",\"bd\",\"be\",\"bf\",\"cd\",\"ce\",\"cf\"]", "explanation": "Map digits to letters like on a phone keypad."}', 
 'medium'),

(15, 'Merge k Sorted Lists: You are given an array of k linked-lists lists, each linked-list is sorted in ascending order.', 
 '{"input": "lists = [[1,4,5],[1,3,4],[2,6]]", "output": "[1,1,2,3,4,4,5,6]", "explanation": "Merge all the linked-lists into one sorted linked-list."}', 
 'hard');
