-- CL Magno IT Solutions | Database Tutorial Series Ep. 9: GROUP BY & HAVING
CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  name     VARCHAR(20),
  item     VARCHAR(30),
  category VARCHAR(10),
  price    INT
);

INSERT INTO orders VALUES
(1,'Ana','Fried Chicken','Food',120),
(2,'Ben','Spaghetti','Food',85),
(3,'Ana','Iced Tea','Drinks',45),
(4,'Carlo','Burger Steak','Food',110),
(5,'Ben','Softdrinks','Drinks',40),
(6,'Carlo','Halo-halo','Dessert',75),
(7,'Ana','Turon','Dessert',30),
(8,'Dana','Palabok','Food',95),
(9,'Carlo','Fries','Food',60),
(10,'Ben','Halo-halo','Dessert',75);

-- Challenge: which categories total more than 150?
-- Write your query below, then check the answer at 10:45.
